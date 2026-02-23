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
    const [repeatMode, setRepeatMode] = useState('all'); // 'none', 'all', 'one'
    const [playingFrom, setPlayingFrom] = useState(null); // { type: 'playlist' | 'dashboard' | 'favorites', id: string | null }
    const [loadingTrackId, setLoadingTrackId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Refs to avoid stale closures in onPlaybackStatusUpdate
    const queueRef = useRef(queue);
    const shuffledQueueRef = useRef(shuffledQueue);
    const currentIndexRef = useRef(currentIndex);
    const isShuffleRef = useRef(isShuffle);
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
                if (status.isLoaded && !status.isPlaying) await sound.playAsync();
            } catch (e) {}
            return;
        }

        if (isLoadingRef.current && isSameTrack && newQueue.length === 0) return;

        try {
            setIsLoading(true);
            setLoadingTrackId(track.id);
            isLoadingRef.current = true;
            setIsBuffering(true);
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
                    progressUpdateIntervalMillis: 500
                },
                onPlaybackStatusUpdate
            );

            setSound(newSound);
            setIsPlaying(true);
            setIsBuffering(false);
            
            // Stall detector: if stuck in loading/buffering for 10s, force skip
            stallTimeoutRef.current = setTimeout(() => {
                if (isLoadingRef.current || isBuffering) {
                    console.warn('Playback stalled for 10s, skipping...');
                    playNext();
                }
            }, 10000);

        } catch (error) {
            console.error('Error in playTrack:', error);
            setIsBuffering(false);
            retryTimeoutRef.current = setTimeout(() => playNext(), 2000);
        } finally {
            isLoadingRef.current = false;
            setIsLoading(false);
            setLoadingTrackId(null);
        }
    };

    const playNext = async () => {
        const sourceQueue = isShuffleRef.current ? shuffledQueueRef.current : queueRef.current;
        if (sourceQueue.length === 0) return;
        
        const isLast = currentIndexRef.current === sourceQueue.length - 1;
        if (isLast) {
            if (repeatModeRef.current === 'none') {
                setIsPlaying(false);
                return;
            }
            if (isShuffleRef.current) {
                const reshuffled = shuffleArray(queueRef.current);
                updateShuffledQueue(reshuffled);
                await playTrack(reshuffled[0]);
                return;
            }
        }

        const nextIndex = (currentIndexRef.current + 1) % sourceQueue.length;
        await playTrack(sourceQueue[nextIndex]);
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
                console.error('Playback monitor error:', status.error);
                playNext();
            }
            return;
        }

        // Clear stall timeout if we are making progress
        if (status.isPlaying && !status.isBuffering) {
            if (stallTimeoutRef.current) {
                clearTimeout(stallTimeoutRef.current);
                stallTimeoutRef.current = null;
            }
        }

        setPosition(status.positionMillis);
        setDuration(status.durationMillis);
        if (!status.isBuffering) setIsPlaying(status.isPlaying);
        setIsBuffering(status.isBuffering);
        
        if (status.didJustFinish && !status.isLooping) playNext();
    };

    const togglePlayPause = async () => {
        if (!sound) return;
        try {
            const status = await sound.getStatusAsync();
            if (status.isLoaded) {
                if (status.isPlaying) {
                    await sound.pauseAsync();
                    setIsPlaying(false);
                } else {
                    await sound.playAsync();
                    setIsPlaying(true);
                }
            }
        } catch (e) {
            console.error('Toggle play/pause error:', e);
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
            stopPlayback
        }}>
            {children}
        </PlayerContext.Provider>
    );
};

export const usePlayer = () => useContext(PlayerContext);
