import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

const FavoritesContext = createContext({});

export const FavoritesProvider = ({ children }) => {
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            fetchFavorites();

            // Real-time subscription for favorites
            const channel = supabase
                .channel('favorite-changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'favorites',
                        filter: `user_id=eq.${user.id}`
                    },
                    () => {
                        fetchFavorites();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        } else {
            setFavorites([]);
        }
    }, [user, fetchFavorites]);

    const fetchFavorites = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('favorites')
                .select(`
                    id,
                    music_id,
                    music:music_id (*)
                `)
                .eq('user_id', user.id);

            if (error) throw error;
            // Filter out items where the music track was deleted
            const validFavorites = data.filter(item => item.music);
            setFavorites(validFavorites);
        } catch (error) {
            console.error('Error fetching favorites:', error.message);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const toggleFavorite = async (track) => {
        if (!user) return;

        const isFavorited = favorites.some(fav => fav.music_id === track.id);

        try {
            if (isFavorited) {
                // Remove from favorites
                const { error } = await supabase
                    .from('favorites')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('music_id', track.id);
                
                if (error) throw error;
                setFavorites(prev => prev.filter(fav => fav.music_id !== track.id));
            } else {
                // Add to favorites
                const { data, error } = await supabase
                    .from('favorites')
                    .insert([{ user_id: user.id, music_id: track.id }])
                    .select(`
                        id,
                        music_id,
                        music:music_id (*)
                    `)
                    .single();

                if (error) throw error;
                setFavorites(prev => [...prev, data]);
            }
        } catch (error) {
            console.error('Error toggling favorite:', error.message);
        }
    };

    const isFavorite = (trackId) => {
        return favorites.some(fav => fav.music_id === trackId);
    };

    return (
        <FavoritesContext.Provider value={{
            favorites,
            loading,
            toggleFavorite,
            isFavorite,
            refreshFavorites: fetchFavorites
        }}>
            {children}
        </FavoritesContext.Provider>
    );
};

export const useFavorites = () => useContext(FavoritesContext);
