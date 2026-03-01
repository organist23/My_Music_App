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
    const [sleepSeconds, setSleepSecondsState] = useState(0); // 0 means off
    const sleepEndTimeRef = useRef(null);
    const soundRef = useRef(null);

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
    const bufferingHideTimeoutRef = useRef(null);
    const isBufferingRef = useRef(false);

    useEffect(() => {
        queueRef.current = queue;
        shuffledQueueRef.current = shuffledQueue;
        currentIndexRef.current = currentIndex;
        isShuffleRef.current = isShuffle;
        repeatModeRef.current = repeatMode;
        currentTrackRef.current = currentTrack;
        soundRef.current = sound;
        isBufferingRef.current = isBuffering;
    }, [queue, shuffledQueue, currentIndex, isShuffle, repeatMode, currentTrack, sound, isBuffering]);

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
            if (bufferingHideTimeoutRef.current) clearTimeout(bufferingHideTimeoutRef.current);
            if (sound) {
                sound.unloadAsync().catch(() => {});
            }
        };
    }, [sound]);

    // Sleep Timer UI Sync Countdown (Keep for foreground visual only)
    useEffect(() => {
        let timer;
        if (sleepSeconds > 0 && isPlaying) {
            timer = setInterval(() => {
                const remaining = sleepEndTimeRef.current ? Math.max(0, Math.floor((sleepEndTimeRef.current - Date.now()) / 1000)) : 0;
                setSleepSecondsState(remaining);
                
                if (remaining <= 0) {
                    clearInterval(timer);
                    sleepEndTimeRef.current = null;
                }
            }, 1000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [sleepSeconds > 0, isPlaying]);

    const setSleepSeconds = (seconds) => {
        if (seconds <= 0) {
            setSleepSecondsState(0);
            sleepEndTimeRef.current = null;
        } else {
            setSleepSecondsState(seconds);
            sleepEndTimeRef.current = Date.now() + (seconds * 1000);
        }
    };

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
                // Spotify Smooth Transition Fix: 
                // Don't flip isPlaying to false if we are transitioning between tracks
                // while already in a "Playing" intent.
                if (!isPlaying && !isBuffering) {
                    setIsPlaying(false);
                }
                
                if (soundRef.current) {
                    await soundRef.current.unloadAsync().catch(() => {});
                    setSound(null);
                    soundRef.current = null;
                }

                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri: track.audio_url },
                    { 
                        shouldPlay: true, 
                        isLooping: repeatModeRef.current === 'one',
                        progressUpdateIntervalMillis: 100,
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
                setIsPlaying(false); // Prevent infinite loop before next play attempt
                playTrack(currentTrackRef.current);
                // If it unloads and we weren't expecting it (and not in loading state),
                // make sure we stop showing as "playing"
                setIsPlaying(false);
                setIsBuffering(false);
                setIsLoading(false);
                isLoadingRef.current = false;
                setLoadingTrackId(null);
            }
            return;
        }

        // Initial Load Cleanup: 
        // We wait until the track is actually playing OR loaded to clear the loader,
        // but we keep isPlaying true if we are in a transition.
        // Initial Load Cleanup: 
        // Once the sound object is created (isLoaded), we transition from "Loading" (metadata/setup)
        // to "Buffering" (network stream status). This prevents the initial loader from 
        // getting stuck if the stream is slow but the object is technically ready.
        if (isLoadingRef.current && status.isLoaded) {
            setIsLoading(false);
            isLoadingRef.current = false;
            setLoadingTrackId(null);
        }

        // INITIAL LOAD SYNC
        if (status.isLoaded && status.shouldPlay && !status.isPlaying && !status.isBuffering) {
            if (!stallTimeoutRef.current) {
                stallTimeoutRef.current = setTimeout(() => {
                    if (soundRef.current) soundRef.current.playAsync().catch(() => {});
                    stallTimeoutRef.current = null;
                }, 1500); // Reduced to 1.5s for snappier feel
            }
        }

        // BUFFERING LOGIC (The "Spotify Smooth" Fix)
        // We use isBufferingRef.current to avoid stale closure issues during network jumps.
        let isActuallyBuffering = status.isBuffering || (status.shouldPlay && !status.isPlaying);

        if (status.isPlaying || !status.shouldPlay) {
            isActuallyBuffering = false;
        }

        if (isActuallyBuffering) {
            // Show loader immediately
            if (bufferingHideTimeoutRef.current) {
                clearTimeout(bufferingHideTimeoutRef.current);
                bufferingHideTimeoutRef.current = null;
            }
            if (!isBufferingRef.current) setIsBuffering(true);
        } else {
            // STALENESS FIX: If audibly playing, clear buffering immediately.
            // Don't wait for a timer if the music is already in the user's ears.
            if (status.isPlaying) {
                if (bufferingHideTimeoutRef.current) {
                    clearTimeout(bufferingHideTimeoutRef.current);
                    bufferingHideTimeoutRef.current = null;
                }
                setIsBuffering(false);
            } else if (isBufferingRef.current && !bufferingHideTimeoutRef.current) {
                // If not playing (e.g. paused), use the smooth exit timer
                bufferingHideTimeoutRef.current = setTimeout(() => {
                    setIsBuffering(false);
                    bufferingHideTimeoutRef.current = null;
                }, 500); // reduced to 500ms for responsiveness
            }
        }

        setIsPlaying(status.isPlaying);
        
        // SYNC PROGRESS (Crucial for all UI bars)
        if (status.positionMillis !== undefined) {
            setPosition(status.positionMillis);
            lastPositionRef.current = status.positionMillis;
        }
        if (status.durationMillis !== undefined) {
            setDuration(status.durationMillis);
        }

        // Auto-play next track logic
        if (status.didJustFinish && !status.isLooping) {
            // Ensure we clear isPlaying briefly only if queue is empty (handled in playNext)
            playNext();
        }

        // SLEEP TIMER BACKGROUND TERMINATE (Robust fix)
        if (sleepEndTimeRef.current && Date.now() >= sleepEndTimeRef.current && status.isPlaying) {
            console.log('[SLEEP] Timer expired, stopping music...');
            sleepEndTimeRef.current = null;
            setSleepSecondsState(0);
            if (soundRef.current) {
                soundRef.current.pauseAsync().catch(() => {});
            }
            setIsPlaying(false);
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
            stopPlayback, reconnectIfStalled, syncQueue,
            sleepSeconds, setSleepSeconds
        }}>
            {children}
        </PlayerContext.Provider>
    );
};

export const usePlayer = () => useContext(PlayerContext);
