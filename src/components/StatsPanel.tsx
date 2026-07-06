import React, { useState, useEffect, useMemo } from "react";
import { Trophy, Clock, Music, User, TrendingUp, Crown, Share2 } from "lucide-react";
import { supabase } from "../services/supabaseClient";

interface StatsPanelProps {
  accumulatedStats: any;
  currentUser: any;
  username: string;
  pfp: string;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

interface LeaderboardUser {
  user_id: string;
  month: string;
  username: string;
  avatar_url: string;
  minutes: number;
  top_tracks: any[];
  top_artists: any[];
  updated_at: string;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ accumulatedStats, currentUser, username, pfp, showToast }) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [prevWinner, setPrevWinner] = useState<LeaderboardUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Compute month strings
  const { currentMonth, prevMonth, monthLabel } = useMemo(() => {
    const d = new Date();
    const current = d.toISOString().substring(0, 7);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const label = `${months[d.getMonth()]} ${d.getFullYear()}`;
    
    d.setMonth(d.getMonth() - 1);
    const prev = d.toISOString().substring(0, 7);
    return { currentMonth: current, prevMonth: prev, monthLabel: label };
  }, []);

  // Compute local user stats
  const localStats = useMemo(() => {
    if (!accumulatedStats || !accumulatedStats.tracks || Object.keys(accumulatedStats.tracks).length === 0) {
      return { totalMinutes: 0, totalPlays: 0, topTracks: [], topArtists: [] };
    }

    const totalMinutes = Math.floor((accumulatedStats.totalSeconds || 0) / 60);
    const totalPlays = Object.values(accumulatedStats.tracks).reduce((acc: number, curr: any) => acc + (curr.count || 0), 0);

    const topTracks = Object.values(accumulatedStats.tracks)
      .map((item: any) => ({
        track: item.track,
        minutes: Math.floor(item.seconds / 60),
        count: item.count
      }))
      .sort((a: any, b: any) => b.minutes - a.minutes || b.count - a.count)
      .slice(0, 10);

    const topArtists = Object.values(accumulatedStats.artists || {})
      .map((item: any) => ({
        name: item.name,
        minutes: Math.floor(item.seconds / 60),
        count: item.count,
        thumbnail: item.thumbnail
      }))
      .sort((a: any, b: any) => b.minutes - a.minutes || b.count - a.count)
      .slice(0, 10);

    return {
      totalMinutes,
      totalPlays,
      topTracks,
      topArtists
    };
  }, [accumulatedStats]);

  // Synchronize stats to Supabase for the current month
  const syncStatsToCloud = async () => {
    if (!currentUser) return;

    try {
      const mappedTracks = localStats.topTracks.map(item => ({
        id: item.track.id,
        title: item.track.title,
        artist: item.track.artist,
        thumbnail: item.track.thumbnail,
        minutes: item.minutes,
        count: item.count
      }));

      const mappedArtists = localStats.topArtists.map(item => ({
        name: item.name,
        minutes: item.minutes,
        count: item.count,
        thumbnail: item.thumbnail
      }));

      const { error } = await supabase.from("user_monthly_stats").upsert({
        user_id: currentUser.id,
        month: currentMonth,
        username: username || currentUser.email?.split("@")[0] || "Anonymous",
        avatar_url: pfp || "",
        minutes: localStats.totalMinutes,
        top_tracks: mappedTracks,
        top_artists: mappedArtists,
        updated_at: new Date().toISOString()
      });

      if (error) throw error;
    } catch (err) {
      console.error("Failed to sync monthly stats:", err);
    }
  };

  // Fetch Leaderboard and Winner from database
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // First sync current stats if logged in
      if (currentUser) {
        await syncStatsToCloud();
      }

      // Fetch current month leaderboard
      const { data: currentLeaderboard, error: curError } = await supabase
        .from("user_monthly_stats")
        .select("*")
        .eq("month", currentMonth)
        .order("minutes", { ascending: false })
        .limit(50);

      if (curError) throw curError;
      setLeaderboard((currentLeaderboard as LeaderboardUser[]) || []);

      // Fetch previous month winner (Desempleado del Mes)
      const { data: prevLeaderboard, error: prevError } = await supabase
        .from("user_monthly_stats")
        .select("*")
        .eq("month", prevMonth)
        .order("minutes", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevError) throw prevError;
      setPrevWinner((prevLeaderboard as LeaderboardUser) || null);

    } catch (err: any) {
      console.error("Failed to fetch leaderboard stats:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser, localStats.totalMinutes, currentMonth, prevMonth]);

  const handleShareStats = () => {
    const text = `📊 Mis estadísticas de este mes en ibramusic:\n⏱️ ¡Escuché ${localStats.totalMinutes} minutos este mes!\n🔥 Top Canción: "${localStats.topTracks[0]?.track.title || "N/A"}" (${localStats.topTracks[0]?.minutes || 0} min)\n👑 Top Artista: ${localStats.topArtists[0]?.name || "N/A"} (${localStats.topArtists[0]?.minutes || 0} min)\n¿Y tú cuántas horas has metido?`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast("Stats share link copied to clipboard!", "success");
    }
  };

  return (
    <section className="flex flex-col gap-8 animate-[fadeIn_0.3s_ease] animate-mobile-page text-left select-none pb-24">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-brand-accent animate-pulse" /> Listening Stats
          </h2>
          <p className="text-xs text-gray-500">Real-time stats, personal top charts, and the monthly leaderboard.</p>
        </div>
        {localStats.totalMinutes > 0 && (
          <button
            onClick={handleShareStats}
            className="self-start sm:self-center py-2 px-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" /> Share Monthly Stats
          </button>
        )}
      </div>

      {/* Pinned "Desempleado del Mes" (Previous Month Winner) */}
      {prevWinner && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-600/20 via-yellow-600/10 to-transparent p-6 border border-yellow-500/20 flex items-center justify-between gap-6 shadow-xl shadow-yellow-950/10 animate-[scaleUp_0.4s_ease-out]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-yellow-400 relative">
              <Crown className="w-8 h-8 animate-[bounce_2s_infinite]" />
              {prevWinner.avatar_url ? (
                <img src={prevWinner.avatar_url} className="absolute inset-0 w-full h-full object-cover rounded-full" alt="" />
              ) : null}
            </div>
            <div>
              <span className="text-[10px] font-black tracking-widest text-yellow-400 uppercase block mb-1">
                Desempleado del Mes 👑
              </span>
              <h3 className="text-lg font-black text-white">{prevWinner.username}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Top listener of the previous month with <strong className="text-yellow-400">{(prevWinner.minutes).toLocaleString()} minutes</strong> wasted in music!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grid of Personal Stats vs Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Personal Stats (2/3 width on large screens) */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-panel p-5 rounded-2xl border border-white/10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400">Time spent this month</span>
                <span className="text-xl font-black text-white mt-0.5">{localStats.totalMinutes.toLocaleString()} minutes</span>
              </div>
            </div>
            
            <div className="glass-panel p-5 rounded-2xl border border-white/10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Music className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400">Total songs played</span>
                <span className="text-xl font-black text-white mt-0.5">{localStats.totalPlays} plays</span>
              </div>
            </div>
          </div>

          {/* Top Songs */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 pl-1">
              <Music className="w-4 h-4 text-cyan-400" /> Top Songs (This Month)
            </h3>
            {localStats.topTracks.length === 0 ? (
              <div className="glass-panel p-8 text-center rounded-2xl text-xs text-gray-500 italic border border-white/5">
                Listen to songs to generate your charts!
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {localStats.topTracks.map((item, idx) => (
                  <div key={item.track.id} className="flex items-center gap-3 glass-panel p-2.5 rounded-2xl border border-white/5">
                    <span className="w-6 text-center font-black text-cyan-400 text-xs">{idx + 1}</span>
                    <img src={item.track.thumbnail || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&auto=format&fit=crop&q=60"} className="w-9 h-9 object-cover rounded-lg bg-neutral-800" alt="" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-white truncate">{item.track.title}</h4>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.track.artist}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-white block">{item.minutes} min</span>
                      <span className="text-[9px] text-gray-500 block mt-0.5">{item.count} plays</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Artists */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 pl-1">
              <User className="w-4 h-4 text-purple-400" /> Top Artists (This Month)
            </h3>
            {localStats.topArtists.length === 0 ? (
              <div className="glass-panel p-8 text-center rounded-2xl text-xs text-gray-500 italic border border-white/5">
                Charts will appear once you listen to more artists.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {localStats.topArtists.map((item, idx) => (
                  <div key={item.name} className="flex items-center gap-3 glass-panel p-2.5 rounded-2xl border border-white/5">
                    <span className="w-6 text-center font-black text-purple-400 text-xs">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-white truncate">{item.name}</h4>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-white block">{item.minutes} min</span>
                      <span className="text-[9px] text-gray-500 block mt-0.5">{item.count} plays</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Global Leaderboard (1/3 width on large screens) */}
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2 pl-1">
            <Trophy className="w-4 h-4 text-yellow-400 animate-bounce" /> Monthly Leaderboard
          </h3>

          <div className="glass-panel rounded-3xl border border-white/10 p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-[10px] font-bold text-gray-500 uppercase">{monthLabel}</span>
              <span className="text-[10px] font-bold text-gray-500 uppercase">Minutes</span>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
                <div className="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px]">Loading Leaderboard...</span>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-500 italic">
                No users ranked this month yet. Be the first!
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
                {leaderboard.map((item, idx) => {
                  const isTop3 = idx < 3;
                  const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600"];
                  const isSelf = currentUser && currentUser.id === item.user_id;

                  return (
                    <div key={`${item.user_id}-${idx}`} className={`flex items-center gap-3 p-2 rounded-xl transition-all ${isSelf ? "bg-brand-accent/10 border border-brand-accent/20" : "hover:bg-white/3 border border-transparent"}`}>
                      {isTop3 ? (
                        <div className={`w-6 text-center font-black flex justify-center text-sm ${rankColors[idx]}`}>
                          <Crown className="w-4.5 h-4.5" />
                        </div>
                      ) : (
                        <span className="w-6 text-center font-bold text-gray-500 text-[10px]">{idx + 1}</span>
                      )}
                      
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs overflow-hidden shrink-0 relative">
                        {item.avatar_url ? (
                          <img src={item.avatar_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <User className="w-4 h-4 text-gray-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white truncate block">{item.username}</span>
                        {idx === 0 && (
                          <span className="text-[8px] bg-yellow-500/20 text-yellow-300 px-1 py-0.5 rounded font-black uppercase tracking-wider mt-0.5 inline-block">Leader 👑</span>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="font-black text-xs text-white">{item.minutes.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {!currentUser && (
              <div className="text-[10px] text-gray-500 text-center border-t border-white/5 pt-3">
                🔒 Log in to sync your stats and join the leaderboard!
              </div>
            )}
          </div>
        </div>

      </div>
    </section>
  );
};

export default StatsPanel;
