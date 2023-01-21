import { either } from "fp-ts";
import { Either, left, right } from "fp-ts/lib/Either";
import { identity, pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import { failure } from "io-ts/lib/PathReporter";
import sqlite3 from "sqlite3";
import { RawData, WebSocket } from "ws";
import {
  advance,
  decode,
  Game,
  initGame,
  Message,
  Move,
  moveCodec,
  parseJson,
  Piece,
  showAdvanceError,
  showApiError,
} from "../../shared";

export type State =
  | {
      tag: "Empty";
      db: sqlite3.Database;
    }
  | {
      tag: "WaitingForOpponent";
      playerX: WebSocket;
      db: sqlite3.Database;
    }
  | {
      tag: "Ready";
      playerX: WebSocket;
      playerO: WebSocket;
      db: sqlite3.Database;
    }
  | {
      tag: "Started";
      playerX: WebSocket;
      playerO: WebSocket;
      game: Game;
      gameId: number;
      db: sqlite3.Database;
    };

type Dispatch = (_: Action) => void;
export type Effect = (state: State, dispatch: Dispatch) => void;
export type Action =
  | {
      tag: "PlayerJoined";
      player: WebSocket;
    }
  | {
      tag: "PlayerLeft";
      playerPiece: Piece;
    }
  | {
      tag: "GameStarted";
      game: Game;
      gameId: number;
    }
  | {
      tag: "MessageReceived";
      playerPiece: Piece;
      data: RawData;
    };

const logError =
  (error: string): Effect =>
  (_) =>
    console.error(error);

const logDebug =
  (message: string): Effect =>
  (_) =>
    console.log(message);

export function update(action: Action, state: State): [State, Effect[]] {
  switch (action.tag) {
    case "PlayerJoined":
      return pipe(
        join(action.player, state),
        either.fold((e) => [state, [logError(e)]], identity)
      );

    case "PlayerLeft":
      if (state.tag === "Started") {
        return [
          { tag: "Empty", db: state.db },
          [
            logDebug(`Player ${action.playerPiece} left the game`),
            send(
              { tag: "OpponentLeft" },
              action.playerPiece === "X" ? state.playerO : state.playerX
            ),
          ],
        ];
      } else {
        return [{ tag: "Empty", db: state.db }, []];
      }

    case "GameStarted":
      if (state.tag === "Ready") {
        return [
          {
            tag: "Started",
            playerX: state.playerX,
            playerO: state.playerO,
            game: action.game,
            gameId: action.gameId,
            db: state.db,
          },
          [
            subscribe("X", state.playerX),
            subscribe("O", state.playerO),
            broadcast({ tag: "GameUpdate", game: action.game }),
          ],
        ];
      } else {
        return [state, [logError("Game is not ready to be started")]];
      }

    case "MessageReceived":
      return pipe(
        action.data.toString("utf8"),
        parseJson,
        either.chain(decode<Move>(moveCodec)),
        either.mapLeft(showApiError),
        either.chain(move(action.playerPiece, state)),
        either.fold((e) => [state, [logError(e)]], identity)
      );
  }
}

function join(ws: WebSocket, state: State): Either<string, [State, Effect[]]> {
  switch (state.tag) {
    case "Empty":
      return right([
        {
          tag: "WaitingForOpponent",
          playerX: ws,
          db: state.db,
        },
        [
          send({ tag: "Connected", piece: "X" }, ws),
          logDebug("First player joined. Waiting for the second player..."),
        ],
      ]);

    case "WaitingForOpponent":
      return right([
        {
          tag: "Ready",
          playerX: state.playerX,
          playerO: ws,
          db: state.db,
        },
        [
          send({ tag: "Connected", piece: "O" }, ws),
          startGame(),
          logDebug("Second player joined. Starting game..."),
        ],
      ]);

    case "Ready":
    case "Started":
      return left("Game already started");
  }
}

const move =
  (playerPiece: Piece, state: State) =>
  (move: Move): Either<string, [State, Effect[]]> => {
    switch (state.tag) {
      case "Empty":
        return left("No players connected");

      case "WaitingForOpponent":
        return left("Waiting for opponent");

      case "Ready":
        return left("Game not started yet");

      case "Started":
        return pipe(
          move,
          advance(state.game)(playerPiece),
          either.bimap(showAdvanceError, (g) => [
            { ...state, game: g },
            [
              saveMove(state.gameId, move, playerPiece),
              broadcast({ tag: "GameUpdate", game: g }),
            ],
          ])
        );
    }
  };

const saveMove =
  (gameId: number, move: Move, piece: Piece) =>
  (state: State, dispatch: Dispatch): void => {
    const s = state.db.prepare(
      "INSERT INTO player_move (game_id, piece, side) VALUES (?, ?, ?)"
    );
    s.run(gameId, piece, move.side);
    s.finalize((err) => {
      if (err) {
        console.error(err);
      } else {
        console.log(
          `Move (${piece}, ${move.row}, ${move.side}) saved for game ${gameId}`
        );
      }
    });
  };

const startGame =
  () =>
  (state: State, dispatch: Dispatch): void => {
    state.db.run("INSERT INTO game DEFAULT VALUES", (err) => {
      if (err !== null) {
        console.error(err);
      } else {
        state.db.prepare("SELECT last_insert_rowid()").get((err, r) => {
          if (err) {
            console.error(err);
          } else {
            const gameId = pipe(
              r,
              lastInsertRowIdCodec.decode,
              either.bimap(failure, (x) => x["last_insert_rowid()"])
            );
            if (either.isRight(gameId)) {
              console.log(`Game started with id ${gameId.right}`);
              dispatch({
                tag: "GameStarted",
                game: initGame(),
                gameId: gameId.right,
              });
            } else {
              console.error(gameId.left);
            }
          }
        });
      }
    });
  };

const send = (message: Message, ws: WebSocket) => (): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

const broadcast =
  (message: Message) =>
  (match: State, _: Dispatch): void => {
    switch (match.tag) {
      case "Empty":
        break;

      case "WaitingForOpponent":
        if (match.playerX.readyState === WebSocket.OPEN) {
          match.playerX.send(JSON.stringify(message));
        }
        break;

      case "Started":
        if (match.playerX.readyState === WebSocket.OPEN) {
          match.playerX.send(JSON.stringify(message));
        }
        if (match.playerO.readyState === WebSocket.OPEN) {
          match.playerO.send(JSON.stringify(message));
        }
        break;
    }
  };

const subscribe =
  (playerPiece: Piece, ws: WebSocket) =>
  (state: State, dispatch: Dispatch): void => {
    ws.on("message", (data: RawData) => {
      dispatch({ tag: "MessageReceived", playerPiece, data });
    });
    ws.on("close", () => {
      dispatch({ tag: "PlayerLeft", playerPiece });
    });
  };

const lastInsertRowIdCodec = t.type({
  "last_insert_rowid()": t.Int,
});
