import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { Audio } from 'expo-av';

const PlayerContext = createContext({});

export const PlayerProvider = ({ children }) => {
    const [sound, setSound] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);

    const [queue, setQueue] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [isShuffle, setIsShuffle] = useState(false);
    const [repeatMode, setRepeatMode] = useState('all'); // 'none', 'all', 'one'
    const [playingFrom, setPlayingFrom] = useState(null); // { type: 'playlist' | 'dashboard' | 'favorites', id: string | null }
    const [loadingTrackId, setLoadingTrackId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Refs to avoid stale closures in onPlaybackStatusUpdate
    const queueRef = useRef(queue);
    const currentIndexRef = useRef(currentIndex);
    const isShuffleRef = useRef(isShuffle);
    const repeatModeRef = useRef(repeatMode);
    const currentTrackRef = useRef(currentTrack);
    const isLoadingRef = useRef(false);

    useEffect(() => {
        queueRef.current = queue;
        currentIndexRef.current = currentIndex;
        isShuffleRef.current = isShuffle;
        repeatModeRef.current = repeatMode;
        currentTrackRef.current = currentTrack;
    }, [queue, currentIndex, isShuffle, repeatMode, currentTrack]);

    // Unified cleanup for sound change/unmount
    useEffect(() => {
        return () => {
            if (sound) {
                sound.unloadAsync().catch(() => {});
            }
        };
    }, [sound]);

    const toggleRepeat = async () => {
        const modes = ['none', 'all', 'one'];
        const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
        
        if (sound) {
            await sound.setIsLoopingAsync(nextMode === 'one');
        }
        setRepeatMode(nextMode);
    };

    const toggleShuffle = () => {
        setIsShuffle(!isShuffle);
    };

    const playTrack = async (track, newQueue = [], context = null) => {
        if (!track) return;

        // 1. Update context if provided
        if (context) {
            setPlayingFrom(context);
        } else if (newQueue.length > 0) {
           // Default fallback if no explicit context but new queue
           setPlayingFrom({ type: 'unknown' });
        }

        // 1. Update queue/index IMMEDIATELY (both state and refs)
        // This is critical for contextual playback ("staying in the playlist")
        let actualQueue = queueRef.current;
        if (newQueue.length > 0) {
            setQueue(newQueue);
            queueRef.current = newQueue;
            actualQueue = newQueue;
        }
        
        const index = actualQueue.findIndex(t => t.id === track.id);
        if (index !== -1) {
            setCurrentIndex(index);
            currentIndexRef.current = index;
        }

        // 2. If same track is already loaded/loading, just play it if paused
        // But we skip this if we just updated to a NEW queue context
        const isSameContext = playingFrom?.type === context?.type && playingFrom?.id === context?.id;
        
        if (currentTrackRef.current?.id === track.id && sound && isSameContext) {
            if (!isPlaying) {
                await sound.playAsync();
            }
            return;
        }

        // 3. Prevent redundant loads of the SAME track if currently loading
        if (isLoadingRef.current && currentTrackRef.current?.id === track.id && newQueue.length === 0) {
            return;
        }

        try {
            setIsLoading(true);
            setLoadingTrackId(track.id);
            isLoadingRef.current = true;

            // 4. Update UI state
            setCurrentTrack(track);
            currentTrackRef.current = track;

            // 5. Clean up previous sound
            if (sound) {
                try {
                    // Try to stop and unload immediately, but don't block too long or hang
                    await sound.unloadAsync().catch(() => {});
                } catch (e) {
                    // Silent fail for cleanup
                }
                setSound(null);
            }

            // 6. Create and play new sound
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri: track.audio_url },
                { 
                    shouldPlay: true, 
                    isLooping: repeatModeRef.current === 'one' 
                },
                onPlaybackStatusUpdate
            );

            setSound(newSound);
            setIsPlaying(true);
        } catch (error) {
            console.error('Error in playTrack:', error);
        } finally {
            isLoadingRef.current = false;
            setIsLoading(false);
            setLoadingTrackId(null);
        }
    };

    const playNext = async () => {
        const currentQueue = queueRef.current;
        if (currentQueue.length === 0) return;
        
        let nextIndex;
        if (isShuffleRef.current && currentQueue.length > 1) {
            let newIndex = currentIndexRef.current;
            while (newIndex === currentIndexRef.current) {
                newIndex = Math.floor(Math.random() * currentQueue.length);
            }
            nextIndex = newIndex;
        } else {
            const isLast = currentIndexRef.current === currentQueue.length - 1;
            if (isLast && repeatModeRef.current === 'none') {
                return; // Stop at end if repeat is off
            }
            nextIndex = (currentIndexRef.current + 1) % currentQueue.length;
        }
        
        const nextTrack = currentQueue[nextIndex];
        await playTrack(nextTrack);
    };

    const playPrev = async () => {
        const currentQueue = queueRef.current;
        if (currentQueue.length === 0) return;
        
        let prevIndex = (currentIndexRef.current - 1 + currentQueue.length) % currentQueue.length;
        const prevTrack = currentQueue[prevIndex];
        await playTrack(prevTrack);
    };

    const onPlaybackStatusUpdate = (status) => {
        if (status.isLoaded) {
            setPosition(status.positionMillis);
            setDuration(status.durationMillis);
            setIsPlaying(status.isPlaying);
            
            if (status.didJustFinish && !status.isLooping) {
                playNext();
            }
        }
    };

    const togglePlayPause = async () => {
        if (!sound) return;

        if (isPlaying) {
            await sound.pauseAsync();
        } else {
            await sound.playAsync();
        }
    };

    const seek = async (value) => {
        if (!sound) return;
        await sound.setPositionAsync(value);
    };

    return (
        <PlayerContext.Provider value={{
            currentTrack,
            isPlaying,
            position,
            duration,
            repeatMode,
            isShuffle,
            toggleRepeat,
            toggleShuffle,
            playNext,
            playPrev,
            playTrack,
            togglePlayPause,
            seek,
            queue,
            currentIndex,
            playingFrom,
            loadingTrackId,
            isLoading
        }}>
            {children}
        </PlayerContext.Provider>
    );
};

export const usePlayer = () => useContext(PlayerContext);
