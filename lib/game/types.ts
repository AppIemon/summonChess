export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  nickname: string;
  text: string;
  timestamp: number;
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
  whiteTime: number; // in seconds
  blackTime: number; // in seconds
  isTimeout: boolean;
  chat: ChatMessage[];
  roomCode?: string;
  undoRequest?: {
    from: PieceColor;
    status: 'pending' | 'accepted' | 'declined';
  } | null;
  resignedBy?: PieceColor | null;
  review?: GameReviewResults | null;
}

export type MoveClassification = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveAnalysis {
  move: string;
  classification: MoveClassification;
  evaluation: number;
  bestMove: string;
  accuracy: number; // 0-100
  comment?: string;
  color: PieceColor;
  toSquare: string;
}

export interface GameReviewResults {
  whiteAccuracy: number;
  blackAccuracy: number;
  moves: MoveAnalysis[];
  fens: string[];
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

export interface ResignAction {
  type: 'resign';
}

export interface ChatAction {
  type: 'chat';
  text: string;
  nickname: string;
}

export interface UndoRequestAction {
  type: 'undo_request';
}

export interface UndoResponseAction {
  type: 'undo_response';
  accept: boolean;
}

export type Action = MoveAction | SummonAction | ResignAction | ChatAction | UndoRequestAction | UndoResponseAction;
