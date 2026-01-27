export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface GameState {
  fen: string;
  turn: PieceColor;
  whiteDeck: PieceType[];
  blackDeck: PieceType[];
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  winner: PieceColor | null;
  history: string[]; // SAN or custom notation for summons
  lastMove: { from: string; to: string } | null; // For highlighting
  whitePlayerId?: string;
  blackPlayerId?: string;
}

export interface MoveAction {
  type: 'move';
  from: string;
  to: string;
  promotion?: string;
}

export interface SummonAction {
  type: 'summon';
  piece: PieceType;
  square: string;
}

export type Action = MoveAction | SummonAction;
