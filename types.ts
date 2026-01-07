
export interface AudioMetadata {
  duration: number;
  loadingTime: number;
  isPlaying: boolean;
  progress: number;
}

export interface TranscriptionResult {
  text: string;
  error?: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  RECORDING = 'RECORDING',
  ERROR = 'ERROR'
}
