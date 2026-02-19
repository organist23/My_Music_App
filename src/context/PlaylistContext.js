import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

const PlaylistContext = createContext({});

export const PlaylistProvider = ({ children }) => {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            fetchPlaylists();

            // Real-time subscription for playlists
            const channel = supabase
                .channel('playlist-changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'playlists',
                        filter: `user_id=eq.${user.id}`
                    },
                    () => {
                        fetchPlaylists();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        } else {
            setPlaylists([]);
        }
    }, [user, fetchPlaylists]);

    const fetchPlaylists = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('playlists')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPlaylists(data || []);
        } catch (error) {
            console.error('Error fetching playlists:', error.message);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const addSongToPlaylist = async (playlistId, musicId) => {
        try {
            const { data, error } = await supabase
                .from('playlist_songs')
                .insert([{ playlist_id: playlistId, music_id: musicId }])
                .select()
                .single();

            if (error) {
                if (error.code === '23505') { // Unique violation
                    return { data: null, error: { message: 'Song is already in this playlist', isDuplicate: true } };
                }
                throw error;
            }
            return { data, error: null };
        } catch (error) {
            console.error('Error adding song to playlist:', error.message);
            return { data: null, error };
        }
    };

    const removeSongFromPlaylist = async (playlistId, musicId) => {
        try {
            const { error } = await supabase
                .from('playlist_songs')
                .delete()
                .eq('playlist_id', playlistId)
                .eq('music_id', musicId);

            if (error) throw error;
            return { error: null };
        } catch (error) {
            console.error('Error removing song from playlist:', error.message);
            return { error };
        }
    };

    const deletePlaylist = async (playlistId) => {
        try {
            const { error } = await supabase
                .from('playlists')
                .delete()
                .eq('id', playlistId);

            if (error) throw error;
            await fetchPlaylists();
            return { error: null };
        } catch (error) {
            console.error('Error deleting playlist:', error.message);
            return { error };
        }
    };

    const fetchPlaylistSongs = async (playlistId) => {
        try {
            const { data, error } = await supabase
                .from('playlist_songs')
                .select(`
                    id,
                    music:music_id (*)
                `)
                .eq('playlist_id', playlistId);

            if (error) throw error;
            // Filter out items where the music track was deleted
            const validSongs = data.filter(item => item.music);
            return { data: validSongs, error: null };
        } catch (error) {
            console.error('Error fetching playlist songs:', error.message);
            return { data: null, error };
        }
    };

    return (
        <PlaylistContext.Provider value={{
            playlists,
            loading,
            addSongToPlaylist,
            removeSongFromPlaylist,
            deletePlaylist,
            fetchPlaylistSongs,
            refreshPlaylists: fetchPlaylists
        }}>
            {children}
        </PlaylistContext.Provider>
    );
};

export const usePlaylists = () => useContext(PlaylistContext);
