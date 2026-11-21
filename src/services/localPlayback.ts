export function createLocalPlayback(audio: HTMLAudioElement) {
  let context: AudioContext | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let normalize = false;
  let disposed = false;

  const setNormalization = async (enabled: boolean) => {
    normalize = enabled;
    if (disposed) return;
    if (compressor) {
      compressor.threshold.value = enabled ? -20 : 0;
      compressor.ratio.value = enabled ? 3 : 1;
      return;
    }
    if (!enabled || context || typeof AudioContext === "undefined") return;
    try {
      const graph = new AudioContext();
      context = graph;
      const running = await Promise.race([graph.resume().then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 500))]);
      if (disposed || !running) {
        if (graph.state !== "closed") await graph.close();
        if (context === graph) context = null;
        return;
      }
      const limiter = graph.createDynamicsCompressor();
      limiter.threshold.value = normalize ? -20 : 0;
      limiter.ratio.value = normalize ? 3 : 1;
      limiter.knee.value = 20;
      limiter.attack.value = .01;
      limiter.release.value = .2;
      limiter.connect(graph.destination);
      graph.createMediaElementSource(audio).connect(limiter);
      compressor = limiter;
    } catch {
      if (context && context.state !== "closed") void context.close().catch(() => {});
      context = null;
    }
  };

  return {
    playVideo: () => audio.play(),
    pauseVideo: () => audio.pause(),
    seekTo: (seconds: number) => { audio.currentTime = seconds; },
    getCurrentTime: () => audio.currentTime,
    getDuration: () => Number.isFinite(audio.duration) ? audio.duration : 0,
    setVolume: (percent: number) => { audio.volume = Math.max(0, Math.min(1, percent / 100)); },
    getPlaybackRate: () => audio.playbackRate,
    setPlaybackRate: (rate: number) => { audio.playbackRate = rate; },
    setNormalization,
    dispose: () => {
      disposed = true;
      audio.pause();
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
