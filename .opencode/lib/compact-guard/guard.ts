// コンパクトはユーザーが明示的に依頼した時（または idle フックの自動実行）だけ実行されるべきで、エージェントが勝手に実行してはならない。
export const isCompactCommand = (command: unknown): boolean => {
  if (typeof command !== 'string') return false;
  return command.includes('compact.mjs');
};
