import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { useAuth } from './AuthContext';

const PlayerContext = createContext({});

export const PlayerProvider = ({ children }) => {
    const [sound, setSound] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);

    const [queue, setQueue] = useState([]);
    const [shuffledQueue, setShuffledQueue] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [isShuffle, setIsShuffle] = useState(false);
    const [repeatMode, setRepeatMode] = useState('none'); // 'none', 'all', 'one'
    const [playingFrom, setPlayingFrom] = useState(null); // { type: 'playlist' | 'dashboard' | 'favorites', id: string | null }
    const [loadingTrackId, setLoadingTrackId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Refs to avoid stale closures in onPlaybackStatusUpdate
    const queueRef = useRef(queue);
    const shuffledQueueRef = useRef(shuffledQueue);
    const currentIndexRef = useRef(currentIndex);
    const isShuffleRef = useRef(isShuffle);
    const lastPositionRef = useRef(0);
    const lastPositionTimeRef = useRef(Date.now());
    const repeatModeRef = useRef(repeatMode);
    const currentTrackRef = useRef(currentTrack);
    const isLoadingRef = useRef(false);
    const retryTimeoutRef = useRef(null);
    const stallTimeoutRef = useRef(null);

    useEffect(() => {
        queueRef.current = queue;
        shuffledQueueRef.current = shuffledQueue;
        currentIndexRef.current = currentIndex;
        isShuffleRef.current = isShuffle;
        repeatModeRef.current = repeatMode;
        currentTrackRef.current = currentTrack;
    }, [queue, shuffledQueue, currentIndex, isShuffle, repeatMode, currentTrack]);

    // Initial Audio mode setup
    useEffect(() => {
        const setupAudio = async () => {
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    staysActiveInBackground: true,
                    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
                    playThroughEarpieceAndroid: false,
                });
            } catch (e) {
                console.error('Error setting audio mode:', e);
            }
        };
        setupAudio();
    }, []);

    // Cleanup effect
    useEffect(() => {
        return () => {
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
            if (sound) {
                sound.unloadAsync().catch(() => {});
            }
        };
    }, [sound]);

    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    const updateQueue = (newQueue) => {
        setQueue(newQueue);
        queueRef.current = newQueue;
    };

    const updateShuffledQueue = (newShuffled) => {
        setShuffledQueue(newShuffled);
        shuffledQueueRef.current = newShuffled;
    };

    const updateCurrentIndex = (index) => {
        setCurrentIndex(index);
        currentIndexRef.current = index;
    };

    const toggleRepeat = async () => {
        const modes = ['none', 'all', 'one'];
        const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
        
        if (sound) {
            await sound.setIsLoopingAsync(nextMode === 'one');
        }
        setRepeatMode(nextMode);
    };

    const toggleShuffle = () => {
        const nextShuffle = !isShuffle;
        setIsShuffle(nextShuffle);
        isShuffleRef.current = nextShuffle;
        
        if (nextShuffle) {
            // Spotify Logic: Keep current track, shuffle the rest
            if (queueRef.current.length > 0) {
                const track = currentTrackRef.current;
                const remaining = queueRef.current.filter(t => t.id !== track?.id);
                const shuffled = track ? [track, ...shuffleArray(remaining)] : shuffleArray(queueRef.current);
                updateShuffledQueue(shuffled);
                updateCurrentIndex(0); // Current track is at 0
            }
        } else {
            // Spotify Logic: Restore original order
            const index = queueRef.current.findIndex(t => t.id === currentTrackRef.current?.id);
            if (index !== -1) updateCurrentIndex(index);
        }
    };

    const stopPlayback = async () => {
        try {
            if (sound) {
                await sound.unloadAsync().catch(() => {});
                setSound(null);
            }
            setIsPlaying(false);
            setIsBuffering(false);
            setCurrentTrack(null);
            currentTrackRef.current = null;
            updateCurrentIndex(-1);
            setQueue([]);
            setShuffledQueue([]);
        } catch (e) {
            console.error('Error stopping playback:', e);
        }
    };

    // Logout Watchdog: Stop music if user logs out
    const { user } = useAuth();
    useEffect(() => {
        if (!user && (sound || isPlaying)) {
            console.log('User logged out, stopping playback...');
            stopPlayback();
        }
    }, [user]);

    const playTrack = async (track, newQueue = [], context = null) => {
        if (!track) return;

        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);

        if (context) setPlayingFrom(context);

        if (newQueue.length > 0) {
            updateQueue(newQueue);
            if (isShuffleRef.current) {
                const remaining = newQueue.filter(t => t.id !== track.id);
                const shuffled = [track, ...shuffleArray(remaining)];
                updateShuffledQueue(shuffled);
            }
        }
        
        const sourceQueue = isShuffleRef.current ? (shuffledQueueRef.current.length > 0 ? shuffledQueueRef.current : queueRef.current) : queueRef.current;
        const index = sourceQueue.findIndex(t => t.id === track.id);
        if (index !== -1) updateCurrentIndex(index);

        const isSameTrack = currentTrackRef.current?.id === track.id;
        const isContextMatch = !context || (playingFrom?.type === context?.type && playingFrom?.id === context?.id);
        
        if (isSameTrack && sound && isContextMatch) {
            try {
                const status = await sound.getStatusAsync();
                if (status.isLoaded) {
                    // Spotify/Premium logic: If track is finished or at very end, restart it
                    if (status.didJustFinish || status.positionMillis >= status.durationMillis - 100) {
                        await sound.setPositionAsync(0);
                    }
                    if (!status.isPlaying) await sound.playAsync();
                }
            } catch (e) {}
            return;
        }

        if (isLoadingRef.current && isSameTrack && newQueue.length === 0) return;
        
        // Spotify UX: Save current position if it's a same-track retry
        const savedPosition = isSameTrack ? (lastPositionRef.current || 0) : 0;

        const attemptPlay = async (retryCount = 0) => {
            try {
                setIsLoading(true);
                setLoadingTrackId(track.id);
                isLoadingRef.current = true;
                // Don't set isBuffering here to avoid flickering; 
                // onPlaybackStatusUpdate will handle it.
                setCurrentTrack(track);
                currentTrackRef.current = track;
                
                if (sound) {
                    await sound.unloadAsync().catch(() => {});
                    setSound(null);
                }

                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri: track.audio_url },
                    { 
                        shouldPlay: true, 
                        isLooping: repeatModeRef.current === 'one',
                        progressUpdateIntervalMillis: 500,
                        positionMillis: savedPosition
                    },
                    onPlaybackStatusUpdate
                );

                setSound(newSound);
                lastPositionRef.current = savedPosition; 
                lastPositionTimeRef.current = Date.now();
                // isPlaying will be updated by onPlaybackStatusUpdate
                
                // We no longer clear isLoading/isBuffering here.
                // We wait for onPlaybackStatusUpdate to detect actual progress.
                
                // Stall detector
                stallTimeoutRef.current = setTimeout(() => {
                    if (isLoadingRef.current || isBuffering) {
                        console.warn('Playback stalled, waiting for connection...');
                    }
                }, 10000);

            } catch (error) {
                // Change console.error to console.log for a friendlier retry experience
                console.log(`[RECONNECTING] Attempt ${retryCount + 1}:`, error.message || error);
                setIsBuffering(true); 
                
                if (retryCount < 5) { 
                    retryTimeoutRef.current = setTimeout(() => attemptPlay(retryCount + 1), 3000);
                } else {
                    console.error('Max retries reached for track:', track.title);
                    setIsBuffering(false);
                    setIsLoading(false);
                    setLoadingTrackId(null);
                    isLoadingRef.current = false;
                }
            }
        };

        await attemptPlay();
    };

    const playNext = async () => {
        const sourceQueue = isShuffleRef.current ? (shuffledQueueRef.current.length > 0 ? shuffledQueueRef.current : queueRef.current) : queueRef.current;
        if (sourceQueue.length === 0) return;
        
        // Safety: ensure current index is within bounds
        const currentIdx = Math.max(0, Math.min(currentIndexRef.current, sourceQueue.length - 1));
        const isLast = currentIdx === sourceQueue.length - 1;

        if (isLast) {
            // Priority: If Repeat-One is on, loop the same track (handled by expo-av, but safety here)
            if (repeatModeRef.current === 'one') {
                if (sound) await sound.setPositionAsync(0).catch(() => {});
                return;
            }

            // If Repeat-All or Shuffle is on, we continue playback
            if (repeatModeRef.current === 'all' || isShuffleRef.current) {
                if (isShuffleRef.current) {
                    const reshuffled = shuffleArray(queueRef.current);
                    updateShuffledQueue(reshuffled);
                    await playTrack(reshuffled[0]);
                } else {
                    await playTrack(sourceQueue[0]);
                }
                return;
            }

            // Otherwise (repeatMode === 'none' and no shuffle), we STOP at the end
            if (sound) {
                await sound.stopAsync().catch(() => {});
                await sound.setPositionAsync(0).catch(() => {});
            }
            setPosition(0);
            setIsPlaying(false);
            setIsBuffering(false);
            return;
        }

        const nextIndex = currentIdx + 1;
        if (nextIndex < sourceQueue.length) {
            await playTrack(sourceQueue[nextIndex]);
        }
    };

    const playPrev = async () => {
        const sourceQueue = isShuffleRef.current ? shuffledQueueRef.current : queueRef.current;
        if (sourceQueue.length === 0) return;
        
        const prevIndex = (currentIndexRef.current - 1 + sourceQueue.length) % sourceQueue.length;
        await playTrack(sourceQueue[prevIndex]);
    };

    const onPlaybackStatusUpdate = (status) => {
        if (!status || !status.isLoaded) {
            if (status?.error) {
                console.log('[RECONNECTING] Playback monitor error:', status.error);
                setIsBuffering(true);
            }
            
            // If we are supposed to be playing but the sound unloaded (fatal connection drop)
            if (currentTrackRef.current && isPlaying && !isLoadingRef.current) {
                console.log('[RECONNECTING] Sound object unloaded unexpectedly, restarting...');
                playTrack(currentTrackRef.current);
            }
            return;
        }

        // Initial Load Cleanup: If we get any valid status, the "Initial Load" is over
        if (isLoadingRef.current) {
            setIsLoading(false);
            isLoadingRef.current = false;
            setLoadingTrackId(null);
        }

        // SYNC POSITION
        setPosition(status.positionMillis);
        setDuration(status.durationMillis);

        // STALL DETECTION
        if (status.isPlaying) {
            lastPositionRef.current = status.positionMillis;
            lastPositionTimeRef.current = Date.now();
        } else {
            // Keep the timer fresh when paused/stopped
            lastPositionTimeRef.current = Date.now();
        }

        // BUFFERING LOGIC (The "Hear it, See it" Fix)
        // If the music is actually playing (audible), we hide the loader immediately.
        // We only show "buffering/loading" if it ISN'T playing but wants to.
        
        let effectiveBuffering = status.isBuffering || (status.shouldPlay && !status.isPlaying);

        // Spotify UX: 
        // 1. If we are audibly playing, hide loader.
        // 2. If the user has explicitly paused (shouldPlay is false), hide loader.
        if (status.isPlaying || !status.shouldPlay) {
            effectiveBuffering = false;
        }

        setIsBuffering(effectiveBuffering);
        setIsPlaying(status.isPlaying);

        // Auto-play next track
        if (status.didJustFinish && !status.isLooping) {
            playNext();
        }
    };

    const togglePlayPause = async () => {
        if (!sound) {
            // Cancel loading logic (Spotify UX)
            if (isLoadingRef.current) {
                console.log('Cancelling track load attempt...');
                setIsLoading(false);
                isLoadingRef.current = false;
                setLoadingTrackId(null);
                setIsBuffering(false);
                setIsPlaying(false);
                if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            }
            return;
        }
        try {
            const status = await sound.getStatusAsync();
            if (status.isLoaded) {
                if (status.isPlaying) {
                    await sound.pauseAsync();
                    setIsPlaying(false);
                    setIsBuffering(false);
                } else {
                    // UX Fix: If track is at the end, restart it
                    if (status.didJustFinish || status.positionMillis >= status.durationMillis - 100) {
                        await sound.setPositionAsync(0);
                    }
                    
                    // Force-clear any previous stall state when resuming
                    lastPositionTimeRef.current = Date.now();
                    setIsBuffering(false);
                    
                    await sound.playAsync();
                }
            }
        } catch (e) {
            console.error('Toggle play/pause error:', e);
        }
    };

    const syncQueue = (newList, context = null) => {
        if (!newList || newList.length === 0) return;
        
        // Only sync if the context matches (e.g. we are playing from the dashboard we just refreshed)
        if (context && playingFrom?.type === context.type && playingFrom?.id === context.id) {
            updateQueue(newList);
            
            // Re-map the current index to the new list
            if (currentTrackRef.current) {
                const newSource = isShuffleRef.current ? (shuffledQueueRef.current.length > 0 ? shuffledQueueRef.current : newList) : newList;
                const newIndex = newSource.findIndex(t => t.id === currentTrackRef.current.id);
                if (newIndex !== -1) {
                    updateCurrentIndex(newIndex);
                }
            }
        }
    };

    const reconnectIfStalled = () => {
        // If we are currently "connecting" or "buffering" and the user manually refreshes the UI,
        // it's a good time to force a fresh connection attempt since internet is likely back.
        if ((isLoadingRef.current || isBuffering) && currentTrackRef.current) {
            console.log('[RECONNECTING] Manual refresh detected, force-restarting stalled track...');
            playTrack(currentTrackRef.current);
        }
    };

    const seek = async (value) => {
        if (!sound) return;
        try {
            await sound.setPositionAsync(value);
        } catch (e) {}
    };

    return (
        <PlayerContext.Provider value={{
            currentTrack, isPlaying, isBuffering, position, duration,
            repeatMode, isShuffle, toggleRepeat, toggleShuffle,
            playNext, playPrev, playTrack, togglePlayPause, seek,
            queue, currentIndex, playingFrom, loadingTrackId, isLoading,
            stopPlayback, reconnectIfStalled, syncQueue
        }}>
            {children}
        </PlayerContext.Provider>
    );
};

export const usePlayer = () => useContext(PlayerContext);
