import mongoose, { Schema, Document } from 'mongoose';

export interface IBestMove extends Document {
  fen: string;
  move: any;
  score: number;
  depth: number;
  updatedAt: Date;
}

const BestMoveSchema: Schema = new Schema({
  fen: { type: String, required: true, unique: true },
  move: { type: Schema.Types.Mixed, required: true },
  score: { type: Number, required: true },
  depth: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});

// Index FEN for fast lookups
BestMoveSchema.index({ fen: 1 });

export default mongoose.models.BestMove || mongoose.model<IBestMove>('BestMove', BestMoveSchema);
