import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { AppState } from 'react-native';
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
    const [playingFrom, setPlayingFrom] = useState(null);
    const [loadingTrackId, setLoadingTrackId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sleepSeconds, setSleepSecondsState] = useState(0); // 0 means off
    const sleepEndTimeRef = useRef(null);
    const soundRef = useRef(null);

    // ─── Refs to avoid stale closures in callbacks ───
    const queueRef = useRef(queue);
    const shuffledQueueRef = useRef(shuffledQueue);
    const currentIndexRef = useRef(currentIndex);
    const isShuffleRef = useRef(isShuffle);
    const lastPositionRef = useRef(0);
    const repeatModeRef = useRef(repeatMode);
    const currentTrackRef = useRef(currentTrack);
    const isLoadingRef = useRef(false);
    const retryTimeoutRef = useRef(null);
    const stallTimeoutRef = useRef(null);
    const bufferingHideTimeoutRef = useRef(null);
    const isBufferingRef = useRef(false);
    const sleepTimerIntervalRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);
    // True if the sleep timer fired — blocks music from (re)starting after expiry
    const sleepExpiredRef = useRef(false);

    // Keep all refs in sync with state
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

    // ─── Audio Mode Setup ───
    const setupAudioMode = async () => {
        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                staysActiveInBackground: true,
                interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                playsInSilentModeIOS: true,
                shouldDuckAndroid: true,
                interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
                playThroughEarpieceAndroid: false
            });
        } catch (e) {
            console.error('Error setting audio mode:', e);
        }
    };

    useEffect(() => {
        setupAudioMode();
    }, []);

    // AppState listener moved further down so it can access sleep timer functions

    // AppState listener moved further down so it can access sleep timer functions

    // ─── Generaly application cleanup effect ───
    useEffect(() => {
        return () => {
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
            if (bufferingHideTimeoutRef.current) clearTimeout(bufferingHideTimeoutRef.current);
            if (sleepTimerIntervalRef.current) clearInterval(sleepTimerIntervalRef.current);
        };
    }, []);

    // ─── Sound unloader effect ───
    useEffect(() => {
        return () => {
            if (sound) {
                try {
                    sound.unloadAsync();
                } catch(e) {}
            }
        };
    }, [sound]);

    // ─── Sleep Timer ───
    // The interval runs every second to update the UI countdown.
    // It works regardless of whether music is playing or connecting.
    // A secondary check in onPlaybackStatusUpdate catches the case where
    // setInterval is throttled by the OS (phone sleep).
    const fireSleepExpiry = () => {
        console.log('[SLEEP] Timer expired — stopping music.');
        sleepExpiredRef.current = true;  // Block music from restarting
        sleepEndTimeRef.current = null;
        setSleepSecondsState(0);
        if (sleepTimerIntervalRef.current) {
            clearInterval(sleepTimerIntervalRef.current);
            sleepTimerIntervalRef.current = null;
        }
        // Pause or unload the current sound (works even while connecting)
        if (soundRef.current) {
            try {
                soundRef.current.unloadAsync();
            } catch(e) {}
        }
        setIsPlaying(false);
        setIsBuffering(false);
    };

    const startSleepTimer = () => {
        if (sleepTimerIntervalRef.current) {
            clearInterval(sleepTimerIntervalRef.current);
            sleepTimerIntervalRef.current = null;
        }

        sleepTimerIntervalRef.current = setInterval(() => {
            if (!sleepEndTimeRef.current) {
                clearInterval(sleepTimerIntervalRef.current);
                sleepTimerIntervalRef.current = null;
                return;
            }
            const remaining = Math.max(0, Math.floor((sleepEndTimeRef.current - Date.now()) / 1000));
            // Always update the UI display, even while buffering
            setSleepSecondsState(remaining);

            if (remaining <= 0) {
                fireSleepExpiry();
            }
        }, 1000);
    };

    const setSleepSeconds = (seconds) => {
        if (sleepTimerIntervalRef.current) {
            clearInterval(sleepTimerIntervalRef.current);
            sleepTimerIntervalRef.current = null;
        }
        // Reset expired flag whenever the user sets a new timer
        sleepExpiredRef.current = false;

        if (seconds <= 0) {
            setSleepSecondsState(0);
            sleepEndTimeRef.current = null;
        } else {
            sleepEndTimeRef.current = Date.now() + (seconds * 1000);
            setSleepSecondsState(seconds);
            startSleepTimer();
        }
    };

    // ─── AppState listener — re-apply audio mode + enforce/refresh sleep timer ───
    useEffect(() => {
            const handleAppStateChange = async (nextState) => {
                const prevState = appStateRef.current;
                appStateRef.current = nextState;

                if (
                    (prevState === 'background' || prevState === 'inactive') &&
                    nextState === 'active'
                ) {
                    // Re-apply audio mode (OS may have revoked the session while sleeping)
                    setupAudioMode();

                    // Check if sleep timer expired while we were asleep
                    if (sleepEndTimeRef.current && Date.now() >= sleepEndTimeRef.current) {
                        fireSleepExpiry();
                        return; // Do NOT resume music
                    }

                    // If timer hasn't expired but is running, force update the frozen UI
                    // and restart the interval so it aligns snappily with wake
                    if (sleepEndTimeRef.current && !sleepExpiredRef.current) {
                        const remaining = Math.max(0, Math.floor((sleepEndTimeRef.current - Date.now()) / 1000));
                        setSleepSecondsState(remaining);
                        startSleepTimer();
                    }

                    // Sleep timer hasn't expired — safe to resume if OS paused us
                    if (!sleepExpiredRef.current && currentTrackRef.current) {
                        if (soundRef.current) {
                            try {
                                const status = await soundRef.current.getStatusAsync();
                                if (status.isLoaded && !status.isPlaying && status.shouldPlay) {
                                    await soundRef.current.playAsync();
                                }
                            } catch (e) {
                                console.log('[AWAKE] Sound error. Reloading it...');
                                playTrack(currentTrackRef.current);
                            }
                        } else {
                            // Sound reference is missing completely? Reload current track
                            console.log('[AWAKE] Sound missing. Reloading it...');
                            playTrack(currentTrackRef.current);
                        }
                    }
                }
            };

            const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => subscription.remove();
    }, []);

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
            try {
                await sound.setIsLoopingAsync(nextMode === 'one');
            } catch (e) {}
        }
        setRepeatMode(nextMode);
        repeatModeRef.current = nextMode;
    };

    // ─── FIX: toggleShuffle — immediately sync refs (don't wait for useEffect) ───
    // Previously the ref update was delayed by one render cycle. If playNext()
    // fired between the state update and the useEffect sync, it used the wrong
    // queue. Now we sync the refs immediately inside toggleShuffle itself.
    const toggleShuffle = () => {
        const nextShuffle = !isShuffleRef.current;
        setIsShuffle(nextShuffle);
        isShuffleRef.current = nextShuffle; // Sync ref immediately

        if (nextShuffle) {
            // Spotify Logic: Keep current track first, shuffle the rest
            if (queueRef.current.length > 0) {
                const track = currentTrackRef.current;
                const remaining = queueRef.current.filter(t => t.id !== track?.id);
                const shuffled = track ? [track, ...shuffleArray(remaining)] : shuffleArray(queueRef.current);
                updateShuffledQueue(shuffled);
                updateCurrentIndex(0); // Current track is at index 0 in shuffled queue
            }
        } else {
            // Restore position in the original queue
            const index = queueRef.current.findIndex(t => t.id === currentTrackRef.current?.id);
            updateCurrentIndex(index !== -1 ? index : 0);
            // Clear shuffled queue so playNext picks from queueRef
            updateShuffledQueue([]);
        }
    };

    const stopPlayback = async () => {
        try {
            if (sleepTimerIntervalRef.current) {
                clearInterval(sleepTimerIntervalRef.current);
                sleepTimerIntervalRef.current = null;
            }
            sleepEndTimeRef.current = null;
            setSleepSecondsState(0);

            if (soundRef.current) {
                try { 
                    await soundRef.current.stopAsync();
                    await soundRef.current.unloadAsync(); 
                } catch(e) {}
                setSound(null);
                soundRef.current = null;
            }
            setIsPlaying(false);
            setIsBuffering(false);
            setCurrentTrack(null);
            currentTrackRef.current = null;
            updateCurrentIndex(-1);
            updateQueue([]);
            updateShuffledQueue([]);
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

        // User is manually initiating playback, so clear any leftover sleep expiry state
        sleepExpiredRef.current = false;

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
        
        // ─── FIX: Use the already-synced refs for index lookup ───
        // Previously used stale state; now refs are always up-to-date.
        const sourceQueue = isShuffleRef.current
            ? (shuffledQueueRef.current.length > 0 ? shuffledQueueRef.current : queueRef.current)
            : queueRef.current;
        const index = sourceQueue.findIndex(t => t.id === track.id);
        if (index !== -1) updateCurrentIndex(index);

        const isSameTrack = currentTrackRef.current?.id === track.id;
        const isContextMatch = !context || (playingFrom?.type === context?.type && playingFrom?.id === context?.id);
        
        if (isSameTrack && sound && isContextMatch) {
            try {
                const status = await sound.getStatusAsync();
                if (!status.isPlaying) {
                    if (status.positionMillis > 0 && Math.abs(status.durationMillis - status.positionMillis) < 500) {
                        await sound.setPositionAsync(0);
                    }
                    await sound.playAsync();
                }
            } catch (e) {}
            return;
        }

        if (isLoadingRef.current && isSameTrack && newQueue.length === 0) return;
        
        const savedPosition = isSameTrack ? (lastPositionRef.current || 0) : 0;

        const attemptPlay = async (retryCount = 0) => {
            // ─── Sleep guard: abort if sleep already expired while we were loading ───
            if (sleepExpiredRef.current) {
                console.log('[SLEEP] Aborting track load — sleep timer already expired.');
                setIsLoading(false);
                isLoadingRef.current = false;
                setLoadingTrackId(null);
                return;
            }

            try {
                setIsLoading(true);
                setLoadingTrackId(track.id);
                isLoadingRef.current = true;
                setCurrentTrack(track);
                currentTrackRef.current = track;
                if (!isPlaying && !isBuffering) {
                    setIsPlaying(false);
                }
                
                if (soundRef.current) {
                    try { await soundRef.current.unloadAsync(); } catch (e) {}
                    setSound(null);
                    soundRef.current = null;
                }

                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri: track.audio_url },
                    { 
                        shouldPlay: true, 
                        positionMillis: savedPosition,
                        isLooping: repeatModeRef.current === 'one'
                    },
                    onPlaybackStatusUpdate
                );
                
                // Re-check sleep after the synchronous load (if it took time)
                if (sleepExpiredRef.current) {
                    console.log('[SLEEP] Aborting playback — sleep timer expired during load.');
                    try { await newSound.unloadAsync(); } catch(e){}
                    setIsLoading(false);
                    isLoadingRef.current = false;
                    setLoadingTrackId(null);
                    setIsPlaying(false);
                    return;
                }

                setSound(newSound);
                soundRef.current = newSound;
                lastPositionRef.current = savedPosition; 
                
                stallTimeoutRef.current = setTimeout(() => {
                    if (isLoadingRef.current || isBufferingRef.current) {
                        console.warn('Playback stalled, waiting for connection...');
                    }
                }, 10000);

            } catch (error) {
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
        // ─── FIX: Read the correct source queue using the already-synced ref ───
        const sourceQueue = isShuffleRef.current
            ? (shuffledQueueRef.current.length > 0 ? shuffledQueueRef.current : queueRef.current)
            : queueRef.current;
        if (sourceQueue.length === 0) return;
        
        const currentIdx = Math.max(0, Math.min(currentIndexRef.current, sourceQueue.length - 1));
        const isLast = currentIdx === sourceQueue.length - 1;

        if (isLast) {
            if (repeatModeRef.current === 'one') {
                if (soundRef.current) try { await soundRef.current.setPositionAsync(0); } catch(e){}
                return;
            }

            if (repeatModeRef.current === 'all' || isShuffleRef.current) {
                if (isShuffleRef.current) {
                    // Re-shuffle the full original queue for the next round
                    const reshuffled = shuffleArray(queueRef.current);
                    updateShuffledQueue(reshuffled);
                    updateCurrentIndex(0);
                    await playTrack(reshuffled[0]);
                } else {
                    updateCurrentIndex(0);
                    await playTrack(sourceQueue[0]);
                }
                return;
            }

            // By default, if they hit the end of a playlist (like the home screen),
            // let's loop back to the beginning instead of stopping abruptly.
            if (sourceQueue && sourceQueue.length > 0) {
                updateCurrentIndex(0);
                await playTrack(sourceQueue[0]);
            } else {
                if (soundRef.current) {
                    try { 
                        await soundRef.current.pauseAsync(); 
                        await soundRef.current.setPositionAsync(0); 
                    } catch(e){}
                }
                setPosition(0);
                setIsPlaying(false);
                setIsBuffering(false);
            }
            return;
        }

        const nextIndex = currentIdx + 1;
        updateCurrentIndex(nextIndex);
        await playTrack(sourceQueue[nextIndex]);
    };

    const playPrev = async () => {
        const sourceQueue = isShuffleRef.current
            ? (shuffledQueueRef.current.length > 0 ? shuffledQueueRef.current : queueRef.current)
            : queueRef.current;
        if (sourceQueue.length === 0) return;
        
        // If we are more than 3 seconds into a track, restart it instead of going back
        if (lastPositionRef.current > 3000) {
            if (soundRef.current) try { await soundRef.current.setPositionAsync(0); } catch(e){}
            return;
        }

        const prevIndex = (currentIndexRef.current - 1 + sourceQueue.length) % sourceQueue.length;
        updateCurrentIndex(prevIndex);
        await playTrack(sourceQueue[prevIndex]);
    };

    const onPlaybackStatusUpdate = (status) => {
        if (!status || !status.isLoaded) {
            if (status && status.error) {
                console.log('[RECONNECTING] Playback monitor error:', status.error);
                setIsBuffering(true);
            }
            if (currentTrackRef.current && !isLoadingRef.current) {
                console.log('[RECONNECTING] Sound unloaded unexpectedly, restarting...');
                playTrack(currentTrackRef.current);
            }
            return;
        }

        if (isLoadingRef.current && status.isLoaded) {
            setIsLoading(false);
            isLoadingRef.current = false;
            setLoadingTrackId(null);
        }

        if (status.isLoaded && status.shouldPlay && !status.isPlaying && !status.isBuffering) {
            if (!stallTimeoutRef.current) {
                stallTimeoutRef.current = setTimeout(() => {
                    if (soundRef.current) {
                        try { soundRef.current.playAsync(); } catch(e) {}
                    }
                    stallTimeoutRef.current = null;
                }, 1500);
            }
        }

        // Buffering indicator
        let isActuallyBuffering = status.isBuffering || (status.shouldPlay && !status.isPlaying);
        if (status.isPlaying || !status.shouldPlay) {
            isActuallyBuffering = false;
        }

        if (isActuallyBuffering) {
            if (bufferingHideTimeoutRef.current) {
                clearTimeout(bufferingHideTimeoutRef.current);
                bufferingHideTimeoutRef.current = null;
            }
            if (!isBufferingRef.current) setIsBuffering(true);
        } else {
            if (status.isPlaying) {
                if (bufferingHideTimeoutRef.current) {
                    clearTimeout(bufferingHideTimeoutRef.current);
                    bufferingHideTimeoutRef.current = null;
                }
                setIsBuffering(false);
            } else if (isBufferingRef.current && !bufferingHideTimeoutRef.current) {
                bufferingHideTimeoutRef.current = setTimeout(() => {
                    setIsBuffering(false);
                    bufferingHideTimeoutRef.current = null;
                }, 500);
            }
        }

        setIsPlaying(status.isPlaying);
        
        if (status.positionMillis !== undefined) {
            setPosition(status.positionMillis / 1000);
            lastPositionRef.current = status.positionMillis;
        }
        if (status.durationMillis !== undefined) {
            setDuration(status.durationMillis / 1000);
        }

        // Auto-advance to next track
        if (status.didJustFinish && !status.isLooping) {
            playNext();
        }

        // ─── Sleep timer backup check (fires on EVERY status update) ───
        // setInterval is throttled by the OS when the screen is off.
        // This catch handles both "buffering" and "playing" states,
        // so the timer works even when music is connecting.
        if (sleepEndTimeRef.current && Date.now() >= sleepEndTimeRef.current) {
            fireSleepExpiry();
        }
    };

    const togglePlayPause = async () => {
        if (!sound) {
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
            if (sound) {
                if (isPlaying) {
                    await sound.pauseAsync();
                    setIsPlaying(false);
                    setIsBuffering(false);
                } else {
                    // User manually resumed, clear any sleep expiry state
                    sleepExpiredRef.current = false;

                    await sound.playAsync();
                }
            }
        } catch (e) {
            console.error('Toggle play/pause error:', e);
        }
    };

    const syncQueue = (newList, context = null) => {
        if (!newList || newList.length === 0) return;
        
        if (context && playingFrom?.type === context.type && playingFrom?.id === context.id) {
            updateQueue(newList);
            
            if (currentTrackRef.current) {
                const newSource = isShuffleRef.current
                    ? (shuffledQueueRef.current.length > 0 ? shuffledQueueRef.current : newList)
                    : newList;
                const newIndex = newSource.findIndex(t => t.id === currentTrackRef.current.id);
                if (newIndex !== -1) {
                    updateCurrentIndex(newIndex);
                }
            }
        }
    };

    const reconnectIfStalled = () => {
        if ((isLoadingRef.current || isBufferingRef.current) && currentTrackRef.current) {
            console.log('[RECONNECTING] Manual refresh detected, force-restarting stalled track...');
            playTrack(currentTrackRef.current);
        }
    };

    const seek = async (value) => {
        if (!sound) return;
        try {
            await sound.setPositionAsync(value * 1000);
            lastPositionRef.current = value * 1000;
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
