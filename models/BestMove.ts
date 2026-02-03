import mongoose, { Schema, Document } from 'mongoose';

export interface IBestMove extends Document {
  fen: string;
  move: any;
  score: number;
  depth: number;
  winCount: number;
  lossCount: number;
  updatedAt: Date;
}

const BestMoveSchema: Schema = new Schema({
  fen: { type: String, required: true },
  move: { type: Schema.Types.Mixed, required: true },
  score: { type: Number, required: true },
  depth: { type: Number, required: true },
  winCount: { type: Number, default: 0 },
  lossCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

// Index FEN and move together for uniqueness per move-position pair, and FEN alone for lookups
BestMoveSchema.index({ fen: 1, move: 1 }, { unique: true });
BestMoveSchema.index({ fen: 1 });

export default mongoose.models.BestMove || mongoose.model<IBestMove>('BestMove', BestMoveSchema);
