import * as t from "io-ts";

export const pieceCodec = t.union([t.literal("X"), t.literal("O")], "Piece");

const row = {
  left: t.array(pieceCodec),
  right: t.array(pieceCodec),
};

export const rowCodec = t.type(row, "Row");

export const rowSideCodec = t.keyof(row, "RowSide");

const board = {
  row1: rowCodec,
  row2: rowCodec,
  row3: rowCodec,
  row4: rowCodec,
  row5: rowCodec,
  row6: rowCodec,
  row7: rowCodec,
};

export const boardCodec = t.type(board, "Board");

export const rowIndexCodec = t.keyof(board, "RowIndex");

export const moveCodec = t.type(
  {
    row: rowIndexCodec,
    side: rowSideCodec,
  },
  "Move"
);

export const gameCodec = t.union([
  t.type({
    tag: t.literal("Playing"),
    board: boardCodec,
    playingPiece: pieceCodec,
  }),
  t.type({
    tag: t.literal("Over"),
    board: boardCodec,
    winner: pieceCodec,
  }),
]);

export const messageCodec = t.union(
  [
    t.type({
      tag: t.literal("Error"),
      message: t.string,
    }),
    t.type({
      tag: t.literal("Connected"),
      piece: pieceCodec,
    }),
    t.type({
      tag: t.literal("OpponentLeft"),
    }),
    t.type({
      tag: t.literal("GameUpdate"),
      game: gameCodec,
    }),
  ],
  "Message"
);
