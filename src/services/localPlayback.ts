export const equalizerFrequencies = [80, 250, 1000, 3500, 10000];
export const equalizerPresets = {
  flat: [0, 0, 0, 0, 0],
  bass: [7, 3, 0, 0, 0],
  voice: [-3, -2, 3, 5, 1],
  electronic: [6, 1, -2, 2, 5],
};

export function createLocalPlayback(audio: HTMLAudioElement) {
  let context: AudioContext | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let normalize = false;
  let gains = equalizerPresets.flat;
  let filters: BiquadFilterNode[] = [];
  let disposed = false;

  const setNormalization = async (enabled: boolean) => {
    normalize = enabled;
    if (disposed) return;
    if (compressor) {
      compressor.threshold.value = enabled ? -20 : 0;
      compressor.ratio.value = enabled ? 3 : 1;
      return;
    }
    if ((!enabled && !gains.some(Boolean)) || context || typeof AudioContext === "undefined") return;
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
      filters = equalizerFrequencies.map((frequency, index) => {
        const filter = graph.createBiquadFilter();
        filter.type = index === 0 ? "lowshelf" : index === equalizerFrequencies.length - 1 ? "highshelf" : "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 0.9;
        filter.gain.value = gains[index];
        return filter;
      });
      let upstream: AudioNode = graph.createMediaElementSource(audio);
      for (const filter of filters) {
        upstream.connect(filter);
        upstream = filter;
      }
      upstream.connect(limiter);
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
    setEqualizer: (values: number[]) => {
      gains = values;
      if (!filters.length) return setNormalization(normalize);
      for (const [index, filter] of filters.entries()) {
        filter.gain.setTargetAtTime(gains[index], filter.context.currentTime, 0.025);
      }
    },
    dispose: () => {
      disposed = true;
      audio.pause();
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
