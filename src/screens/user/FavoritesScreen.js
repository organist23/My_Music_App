import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useFocusEffect } from '@react-navigation/native';
import { useFavorites } from '../../context/FavoritesContext';
import { usePlayer } from '../../context/PlayerContext';
import { Ionicons } from '@expo/vector-icons';
import SkeletonCard from '../../components/SkeletonCard';
import PlayingVisualizer from '../../components/PlayingVisualizer';

const FavoritesScreen = ({ navigation }) => {
    const { favorites, loading, refreshFavorites } = useFavorites();
    const { playTrack, currentTrack, isPlaying, togglePlayPause, loadingTrackId } = usePlayer();
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshFavorites();
        setRefreshing(false);
    }, [refreshFavorites]);

    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'android') {
                NavigationBar.setButtonStyleAsync('light');
            }
            refreshFavorites();
        }, [refreshFavorites])
    );

    const handleCardPress = (track) => {
        if (currentTrack?.id !== track.id) {
            playTrack(track, favorites.map(f => f.music), { type: 'favorites' });
        }
        navigation.navigate('Player');
    };

    const handleTogglePlay = (track) => {
        if (currentTrack?.id === track.id) {
            togglePlayPause();
        } else {
            playTrack(track, favorites.map(f => f.music), { type: 'favorites' });
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const renderItem = ({ item }) => {
        const isCurrent = currentTrack?.id === item.music.id;
        const isAnyPlaying = !!currentTrack;

        return (
            <TouchableOpacity 
                style={[
                    styles.card,
                    isCurrent && styles.activeCard,
                    isAnyPlaying && !isCurrent && styles.inactiveCard
                ]}
                onPress={() => handleCardPress(item.music)}
            >
                <View style={styles.coverContainer}>
                    <Image source={{ uri: item.music.cover_url }} style={styles.trackCover} />
                    {currentTrack?.id === item.music.id && (
                        <View style={styles.visualizerOverlay}>
                            <PlayingVisualizer isPlaying={isPlaying} />
                        </View>
                    )}
                </View>
                <View style={styles.musicInfo}>
                    <Text style={[styles.musicTitle, currentTrack?.id === item.music.id && { color: '#1DB954' }]} numberOfLines={1}>
                        {item.music.title}
                    </Text>
                    <Text style={styles.musicArtist} numberOfLines={1}>{item.music.artist}</Text>
                    <Text style={styles.releaseDate}>{formatDate(item.music.created_at)}</Text>

                </View>
                <TouchableOpacity style={styles.playBtn} onPress={() => handleTogglePlay(item.music)}>
                    {loadingTrackId === item.music.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Ionicons 
                            name={currentTrack?.id === item.music.id && isPlaying ? 'pause' : 'play'} 
                            size={20} 
                            color="#fff" 
                        />
                    )}
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Your Favorites</Text>
                <View style={{ width: 40 }} />
            </View>
            {loading ? (
                <View style={styles.list}>
                    <View style={styles.skeletonRow}>
                        <SkeletonCard />
                        <SkeletonCard />
                    </View>
                    <View style={styles.skeletonRow}>
                        <SkeletonCard />
                        <SkeletonCard />
                    </View>
                </View>
            ) : (
                <FlatList
                    data={favorites}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                        <Ionicons name="heart-dislike-outline" size={80} color="#333" />
                        <Text style={styles.emptyText}>No favorites yet</Text>
                        <Text style={styles.emptySubText}>Songs you like will appear here</Text>
                        <TouchableOpacity 
                            style={styles.exploreBtn}
                            onPress={() => navigation.navigate('Home')}
                        >
                            <Text style={styles.exploreBtnText}>Explore Music</Text>
                        </TouchableOpacity>
                    </View>
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#1DB954"
                            colors={["#1DB954"]}
                        />
                    }
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 50,
        paddingHorizontal: 15,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#282828',
    },
    activeCard: {
        borderColor: '#1DB954',
        borderWidth: 2,
        backgroundColor: '#222',
    },
    inactiveCard: {
        opacity: 0.6,
    },
    coverContainer: {
        width: 60,
        height: 60,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#333',
    },
    trackCover: {
        width: '100%',
        height: '100%',
    },
    visualizerOverlay: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        zIndex: 10,
        transform: [{ scale: 0.6 }], // Scale down for small thumbnail
    },
    musicInfo: {
        flex: 1,
        marginLeft: 15,
    },
    musicTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    musicArtist: {
        color: '#aaa',
        fontSize: 14,
        marginTop: 2,
    },
    releaseDate: {
        color: '#666',
        fontSize: 10,
        fontStyle: 'italic',
        marginTop: 4,
    },
    activeIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    activeText: {
        color: '#1DB954',
        fontSize: 12,
        marginLeft: 4,
        fontWeight: 'bold',
    },
    playBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 100,
    },
    emptyEmoji: {
        fontSize: 60,
        color: '#282828',
        marginBottom: 20,
    },
    emptyText: {
        color: '#aaa',
        textAlign: 'center',
        fontSize: 16,
    },
    skeletonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
});

export default FavoritesScreen;
