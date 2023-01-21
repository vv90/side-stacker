import { array, either, nonEmptyArray, option } from "fp-ts";
import { Either, left, right } from "fp-ts/lib/Either";
import { identity, pipe } from "fp-ts/lib/function";
import { none, Option, some } from "fp-ts/lib/Option";

export type Piece = "X" | "O";

function nextPiece(piece: Piece): Piece {
  switch (piece) {
    case "X":
      return "O";
    case "O":
      return "X";
  }
}

// making invalid states like xx_x_o impossible to represent in the type system
export type Row = {
  left: Piece[];
  right: Piece[];
};

export type RowSide = keyof Row;

const MaxRowPieces = 7;

export type RowFullError = {
  tag: "RowFullError";
};

function numPieces(row: Row): number {
  return row.left.length + row.right.length;
}

const addPiece =
  (piece: Piece, side: RowSide) =>
  (row: Row): Either<RowFullError, Row> => {
    switch (side) {
      case "left":
        return numPieces(row) < MaxRowPieces
          ? right({ ...row, left: [piece, ...row.left] })
          : left({ tag: "RowFullError" });

      case "right":
        return numPieces(row) < MaxRowPieces
          ? right({ ...row, right: [...row.right, piece] })
          : left({ tag: "RowFullError" });
    }
  };

export type Board = {
  row1: Row;
  row2: Row;
  row3: Row;
  row4: Row;
  row5: Row;
  row6: Row;
  row7: Row;
};

export type RowIndex = keyof Board;

export function rowIndexes(): RowIndex[] {
  return ["row1", "row2", "row3", "row4", "row5", "row6", "row7"];
}

export function toGrid(board: Board): Option<Piece>[][] {
  return rowIndexes().map((rowIndex) => [
    ...array.map(some)(board[rowIndex].left),
    ...array.replicate(MaxRowPieces - numPieces(board[rowIndex]), none),
    ...array.map(some)(board[rowIndex].right),
  ]);
}

function connectedFour(board: Board): boolean {
  const allRows: Option<Piece>[][] = toGrid(board);

  type Coord = {
    i: number;
    j: number;
  };

  type CoordMove = {
    movei: (i: number) => number;
    movej: (j: number) => number;
  };

  // recursively check if the next piece (if any) in (movei, movej) direction is the same as the current piece
  const chainPieces = (
    move: CoordMove,
    coord: Coord,
    piece: Piece,
    chained: Coord[]
  ): Option<Coord[]> => {
    const nextCoord = {
      i: move.movei(coord.i),
      j: move.movej(coord.j),
    };

    if (chained.length === 4) {
      return some(chained);
    } else {
      return pipe(
        allRows,
        array.lookup(nextCoord.i), // check if row exists
        option.chain(array.lookup(nextCoord.j)), // check if column exists
        option.chain(identity), // check if piece is present
        option.filter((p) => p === piece), // check if piece is the same
        option.chain(
          (_) => chainPieces(move, nextCoord, piece, [...chained, nextCoord]) // recurse
        )
      );
    }
  };

  // define possible connect directions (row, column, and 2 mirrored diagonals)
  // along with their valid starting points
  // and a function to apply the search in the specified direction with specified valid starting points

  const checkDirection = (
    move: CoordMove,
    is: number[],
    js: number[]
  ): Option<Coord[]> =>
    pipe(
      array.comprehension([is, js], (i, j) => ({ i, j })),
      array.filterMap((coord) =>
        pipe(
          array.lookup(coord.i)(allRows),
          option.chain(array.lookup(coord.j)),
          option.chain(identity), // check if piece is present
          option.map((p) => ({ coord, piece: p }))
        )
      ),
      array.findFirstMap(({ coord, piece }) =>
        chainPieces(move, coord, piece, [coord])
      )
    );

  const checkRows = () =>
    checkDirection(
      { movei: (i) => i, movej: (j) => j + 1 }, // move right
      nonEmptyArray.range(0, 6), // all rows
      nonEmptyArray.range(0, 3) // need 3 pieces to the right of the starting point to make a 4-piece chain
    );

  const checkColumns = () =>
    checkDirection(
      { movei: (i) => i + 1, movej: (j) => j }, // move down
      nonEmptyArray.range(0, 3), // need 3 pieces below the starting point to make a 4-piece chain
      nonEmptyArray.range(0, 6) // all columns
    );

  const checkRightDiagonal = () =>
    checkDirection(
      { movei: (i) => i + 1, movej: (j) => j + 1 }, // move down and right
      // need 3 pieces below and to the right of the starting point to make a 4-piece chain
      nonEmptyArray.range(0, 3),
      nonEmptyArray.range(0, 3)
    );

  const checkLeftDiagonal = () =>
    checkDirection(
      { movei: (i) => i + 1, movej: (j) => j - 1 }, // move down and left
      // need 3 pieces below and to the left of the starting point to make a 4-piece chain
      nonEmptyArray.range(0, 3),
      nonEmptyArray.range(3, 6)
    );

  return (
    option.isSome(checkRows()) ||
    option.isSome(checkColumns()) ||
    option.isSome(checkRightDiagonal()) ||
    option.isSome(checkLeftDiagonal())
  );
}

export type Move = {
  row: RowIndex;
  side: RowSide;
};

export type Game =
  | {
      tag: "Playing";
      board: Board;
      playingPiece: Piece;
    }
  | {
      tag: "Over";
      board: Board;
      winner: Piece;
    };

export type GameOverError = {
  tag: "GameOverError";
};

export type IncorrectPieceError = {
  tag: "IncorrectPieceError";
  expected: Piece;
  actual: Piece;
};

export type AdvanceError = RowFullError | GameOverError | IncorrectPieceError;

export function showAdvanceError(error: AdvanceError): string {
  switch (error.tag) {
    case "RowFullError":
      return `Row is full`;

    case "GameOverError":
      return "Game is over";

    case "IncorrectPieceError":
      return `Incorrect piece. Expected ${error.expected}, got ${error.actual} `;
  }
}

export const advance =
  (game: Game) =>
  (piece: Piece) =>
  ({ row, side }: Move): Either<AdvanceError, Game> => {
    switch (game.tag) {
      case "Playing":
        return piece === game.playingPiece
          ? pipe(
              addPiece(game.playingPiece, side)(game.board[row]),
              either.map((newRow) => {
                const newBoard = { ...game.board, [row]: newRow };

                if (connectedFour(newBoard)) {
                  return {
                    tag: "Over",
                    board: newBoard,
                    winner: game.playingPiece,
                  };
                } else {
                  return {
                    tag: "Playing",
                    board: newBoard,
                    playingPiece: nextPiece(game.playingPiece),
                  };
                }
              })
            )
          : left({
              tag: "IncorrectPieceError",
              expected: game.playingPiece,
              actual: piece,
            });

      case "Over":
        return left({ tag: "GameOverError" });
    }
  };

export function initGame(): Game {
  return {
    tag: "Playing",
    board: {
      row1: { left: [], right: [] },
      row2: { left: [], right: [] },
      row3: { left: [], right: [] },
      row4: { left: [], right: [] },
      row5: { left: [], right: [] },
      row6: { left: [], right: [] },
      row7: { left: [], right: [] },
    },
    playingPiece: "X",
  };
}

export type Message =
  | {
      tag: "Error";
      message: string;
    }
  | {
      tag: "Connected";
      piece: Piece;
    }
  | {
      tag: "OpponentLeft";
    }
  | {
      tag: "GameUpdate";
      game: Game;
    };
