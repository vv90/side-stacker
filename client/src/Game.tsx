import { array, either, option } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import { Option } from "fp-ts/lib/Option";
import { useReducer } from "react";
import {
  decode,
  Game,
  Message,
  messageCodec,
  Move,
  parseJson,
  Piece,
  RowIndex,
  rowIndexes,
  showApiError,
  toGrid
} from "shared";

type Disconnected = {
  tag: "Disconnected";
};

type Waiting = {
  tag: "Waiting";
  piece: Piece;
  // ws: WebSocket
};

type Connected = {
  tag: "Connected";
  ws: WebSocket;
  game: Game;
  piece: Piece;
};

type State = Disconnected | Waiting | Connected;

const initState: State = {
  tag: "Disconnected",
};

type Action = {
  ws: WebSocket;
  message: Message;
};

function update(state: State, action: Action): State {
  const msg = action.message;
  switch (msg.tag) {
    case "Connected":
      return { tag: "Waiting", piece: msg.piece };
    case "OpponentLeft":
      return { tag: "Disconnected" };
    case "GameUpdate":
      if (state.tag === "Disconnected") {
        console.error("Received game update when disconnected");
        return state;
      } else {
        return {
          tag: "Connected",
          game: msg.game,
          piece: state.piece,
          ws: action.ws,
        };
      }
    case "Error":
      console.error(msg.message);
      return state;
  }
}

export function GameComponent() {
  const [state, dispatch] = useReducer(update, initState);

  const connect = () => {
    const ws = new WebSocket("ws://localhost:4000");

    ws.onmessage = (event) => {
      const msg = pipe(
        event.data as string,
        parseJson,
        either.chain(decode<Message>(messageCodec)),
        either.mapLeft(showApiError)
      );
      if (either.isRight(msg)) {
        console.log(msg.right.tag);
        dispatch({ message: msg.right, ws });
      } else {
        console.error(msg.left);
      }
    };
  };

  switch (state.tag) {
    case "Disconnected":
      return (
        <h1 className="button" onClick={connect}>
          Start
        </h1>
      );
    case "Waiting":
      return <h1 className="label">Waiting for opponent...</h1>;
    case "Connected":
      // {array.replicate(5,
      //   <>
      //     <div className='grid-col-separator'></div>
      //     <div className='grid-row-separator'></div>
      //   </>
      // )}

      switch (state.game.tag) {
        case "Playing":
          return (
            <div className="game-grid">
              {pipe(
                rowIndexes(),
                array.map((row) => (
                  <ActionButtons
                    key={rowIndexNumber(row)}
                    row={row}
                    piece={state.piece}
                    enabled={
                      state.game.tag === "Playing" &&
                      state.game.playingPiece === state.piece
                    }
                    makeMove={(move) => state.ws.send(JSON.stringify(move))}
                  />
                ))
              )}
              {toGrid(state.game.board).map((row: Option<Piece>[], i) =>
                row.map((cell: Option<Piece>, j) => {
                  return (
                    <PieceContent
                      key={`${i}-${j}`}
                      piece={cell}
                      row={i + 1}
                      col={j + 1}
                    />
                  );
                })
              )}
            </div>
          );
        case "Over":
          return (
            <h1 className="label">
              {state.game.winner === state.piece ? "You won :)" : "You lost :("}
            </h1>
          );
      }
  }
}

type PieceContentProps = {
  piece: Option<Piece>;
  row: number;
  col: number;
};
function PieceContent({ piece, row, col }: PieceContentProps): JSX.Element {
  let content = (item: JSX.Element) => (
    <span className="grid-item" style={{ gridColumn: col, gridRow: row }}>
      {item}
    </span>
  );
  if (option.isSome(piece)) {
    return content(<PieceIcon piece={piece.value} />);
  } else {
    return content(<></>);
  }
}

type ActionButtonsProps = {
  row: RowIndex;
  piece: Piece;
  enabled: boolean;
  makeMove: (move: Move) => void;
};
function ActionButtons({
  row,
  piece,
  enabled,
  makeMove,
}: ActionButtonsProps): JSX.Element {
  return (
    <>
      <button
        className={`action-button action-button-left`}
        style={{ gridColumn: 1, gridRow: rowIndexNumber(row) }}
        onClick={() => makeMove({ row, side: "left" })}
        disabled={!enabled}
      >
        <PieceIcon piece={piece} />
        &nbsp; &rarr;
      </button>
      <button
        className={`action-button action-button-right`}
        style={{ gridColumn: -1, gridRow: rowIndexNumber(row) }}
        onClick={() => makeMove({ row, side: "right" })}
        disabled={!enabled}
      >
        &larr; &nbsp;
        <PieceIcon piece={piece} />
      </button>
    </>
  );
}

function PieceIcon({ piece }: { piece: Piece }): JSX.Element {
  switch (piece) {
    case "X":
      return <>&#x2715;</>;
    case "O":
      return <>&#x25EF;</>;
  }
}

function rowIndexNumber(row: RowIndex): number {
  switch (row) {
    case "row1":
      return 1;
    case "row2":
      return 2;
    case "row3":
      return 3;
    case "row4":
      return 4;
    case "row5":
      return 5;
    case "row6":
      return 6;
    case "row7":
      return 7;
  }
}
