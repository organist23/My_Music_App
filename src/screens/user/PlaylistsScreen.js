import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Modal, Alert, Image, Dimensions, RefreshControl, ScrollView, Platform } from 'react-native';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import { usePlaylists } from '../../context/PlaylistContext';
import { Ionicons } from '@expo/vector-icons';
import SkeletonCard from '../../components/SkeletonCard';
import PlayingVisualizer from '../../components/PlayingVisualizer';
import { useFocusEffect } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';

const { width } = Dimensions.get('window');

const PlaylistsScreen = ({ navigation }) => {
    const [selectedPlaylist, setSelectedPlaylist] = useState(null);
    const [playlistSongs, setPlaylistSongs] = useState([]);
    const [songsLoading, setSongsLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [songsRefreshing, setSongsRefreshing] = useState(false);
    
    const { playlists, loading, refreshPlaylists, fetchPlaylistSongs, removeSongFromPlaylist, deletePlaylist } = usePlaylists();
    const { playTrack, currentTrack, isPlaying, playingFrom, togglePlayPause, loadingTrackId, isBuffering } = usePlayer();
    const { user } = useAuth();

    const handlePlaylistPress = async (playlist) => {
        setSelectedPlaylist(playlist);
        setSongsLoading(true);
        await refreshPlaylistSongs(playlist.id);
        setSongsLoading(false);
    };

    const refreshPlaylistSongs = useCallback(async (playlistId) => {
        const { data, error } = await fetchPlaylistSongs(playlistId);
        if (!error) {
            setPlaylistSongs(data || []);
        }
    }, [fetchPlaylistSongs]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshPlaylists();
        setRefreshing(false);
    }, [refreshPlaylists]);

    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'android') {
                NavigationBar.setButtonStyleAsync('light');
            }
            refreshPlaylists();
        }, [refreshPlaylists])
    );

    const onRefreshSongs = useCallback(async () => {
        if (!selectedPlaylist) return;
        setSongsRefreshing(true);
        await refreshPlaylistSongs(selectedPlaylist.id);
        setSongsRefreshing(false);
    }, [selectedPlaylist, refreshPlaylistSongs]);

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return `${day} • ${time}`;
    };

    const handleRemoveSong = async (musicId) => {
        Alert.alert(
            'Remove Song',
            'Are you sure you want to remove this song from the playlist?',
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Remove', 
                    style: 'destructive',
                    onPress: async () => {
                        if (!selectedPlaylist?.id || !musicId) return;
                        
                        const { error } = await removeSongFromPlaylist(selectedPlaylist.id, musicId);
                        if (error) {
                            Alert.alert('Error', 'Could not remove song.');
                        }
                    }
                }
            ]
        );
    };

    // Real-time subscription for songs within the selected playlist
    useEffect(() => {
        if (!selectedPlaylist) return;

        const channel = supabase
            .channel(`playlist-songs-${selectedPlaylist.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'playlist_songs',
                    filter: `playlist_id=eq.${selectedPlaylist.id}`
                },
                () => {
                    refreshPlaylistSongs(selectedPlaylist.id);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedPlaylist, refreshPlaylistSongs]);

    const handleCreatePlaylist = async () => {
        if (!newPlaylistName.trim()) return;

        try {
            const { error } = await supabase
                .from('playlists')
                .insert([{ name: newPlaylistName, user_id: user.id }]);

            if (error) throw error;
            
            setNewPlaylistName('');
            setModalVisible(false);
            refreshPlaylists();
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    const handleDeletePlaylist = async (playlist, isInternal = false) => {
        Alert.alert(
            'Delete Playlist',
            `Are you sure you want to delete "${playlist.name}"? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Delete', 
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await deletePlaylist(playlist.id);
                        if (!error) {
                            if (isInternal) {
                                setSelectedPlaylist(null);
                            }
                        } else {
                            Alert.alert('Error', 'Could not delete playlist.');
                        }
                    }
                }
            ]
        );
    };

    const renderPlaylist = ({ item }) => (
        <View style={styles.card}>
            <TouchableOpacity 
                style={styles.playlistMain}
                onPress={() => handlePlaylistPress(item)}
            >
                <View style={styles.playlistIcon}>
                    <Text style={styles.iconText}>🎶</Text>
                </View>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.count}>View songs</Text>
                </View>
            </TouchableOpacity>
            <TouchableOpacity 
                style={styles.playlistDeleteBtn}
                onPress={() => handleDeletePlaylist(item)}
            >
                <Ionicons name="trash-outline" size={20} color="#ff4444" />
            </TouchableOpacity>
        </View>
    );

    const renderSong = ({ item, isCurrentID, isCurrentContext }) => (
        <View style={[styles.songCard, isCurrentContext && styles.activeSongCard]}>
            <TouchableOpacity 
                style={styles.songMain}
                onPress={() => {
                    if (isCurrentID) {
                        togglePlayPause();
                    } else {
                        const queue = playlistSongs.map(ps => ps.music);
                        playTrack(item.music, queue, { type: 'playlist', id: selectedPlaylist.id });
                    }
                    navigation.navigate('Player');
                }}
            >
                <View style={styles.songThumbnailContainer}>
                    <Image source={{ uri: item.music.cover_url }} style={styles.songCover} />
                    {isCurrentID && (
                        <View style={styles.visualizerOverlay}>
                            <PlayingVisualizer isPlaying={isPlaying} />
                        </View>
                    )}
                    <TouchableOpacity 
                        style={styles.songPlayOverlay}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        onPress={() => {
                            if (isCurrentID) {
                                togglePlayPause();
                            } else {
                                const queue = playlistSongs.map(ps => ps.music);
                                playTrack(item.music, queue, { type: 'playlist', id: selectedPlaylist.id });
                            }
                        }}
                    >
                        {(loadingTrackId === item.music.id || (isCurrentID && isBuffering)) ? (
                            <ActivityIndicator size="small" color="#000" />
                        ) : (
                            <Ionicons 
                                name={isCurrentID && isPlaying ? 'pause' : 'play'} 
                                size={18} 
                                color="#000" 
                                style={!(isCurrentID && isPlaying) && { marginLeft: 2 }}
                            />
                        )}
                    </TouchableOpacity>
                </View>
                <View style={styles.songInfo}>
                    <Text style={[styles.songTitle, isCurrentID && styles.activeSongText]} numberOfLines={1}>
                        {item.music.title}
                    </Text>
                    <Text style={styles.songArtist} numberOfLines={1}>
                        {item.music.artist} <Text style={styles.artistDot}>•</Text> {item.music.genre}
                    </Text>
                    <Text style={styles.releaseDate}>{formatDate(item.music.created_at)}</Text>
                </View>
                {isCurrentContext && (
                    <View style={[styles.playingBadge, !isPlaying && styles.pausedBadge]}>
                        <Text style={styles.playingBadgeText}>
                            {isPlaying ? 'NOW PLAYING' : 'PAUSED'}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
            <TouchableOpacity 
                style={styles.removeBtn}
                onPress={() => handleRemoveSong(item.music.id)}
            >
                <Ionicons name="close-circle-outline" size={22} color="#ff4444" />
            </TouchableOpacity>
        </View>
    );

    const renderPlaylistContent = () => {
        if (songsLoading) {
            return (
                <View style={[styles.list, { marginTop: 20 }]}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <SkeletonCard key={i} variant="row" />
                    ))}
                </View>
            );
        }

        const isPlayingFromThisPlaylist = playingFrom?.type === 'playlist' && playingFrom?.id === selectedPlaylist.id;
        const currentTrackIndex = isPlayingFromThisPlaylist 
            ? playlistSongs.findIndex(ps => ps.music.id === currentTrack?.id)
            : -1;
        
        let nowPlaying = null;
        let upNext = [];

        if (currentTrackIndex !== -1) {
            nowPlaying = playlistSongs[currentTrackIndex];
            upNext = playlistSongs.slice(currentTrackIndex + 1);
        }

        return (
            <ScrollView 
                style={{ flex: 1 }}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={songsRefreshing}
                        onRefresh={onRefreshSongs}
                        tintColor="#1DB954"
                        colors={["#1DB954"]}
                    />
                }
            >
                {nowPlaying && isPlayingFromThisPlaylist && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Now Playing</Text>
                        {renderSong({ item: nowPlaying, isCurrentID: true, isCurrentContext: true })}
                    </View>
                )}

                {upNext.length > 0 && isPlayingFromThisPlaylist && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Up Next</Text>
                            <Text style={styles.sectionSubtitle}>from {selectedPlaylist.name}</Text>
                        </View>
                        {upNext.map(item => (
                            <React.Fragment key={item.id}>
                                {renderSong({ 
                                    item, 
                                    isCurrentID: item.music.id === currentTrack?.id, 
                                    isCurrentContext: false 
                                })}
                            </React.Fragment>
                        ))}
                    </View>
                )}

                {!isPlayingFromThisPlaylist || currentTrackIndex === -1 ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Songs</Text>
                        {playlistSongs.length > 0 ? (
                            playlistSongs.map(item => (
                                <React.Fragment key={item.id}>
                                    {renderSong({ 
                                        item, 
                                        isCurrentID: item.music.id === currentTrack?.id, 
                                        isCurrentContext: false 
                                    })}
                                </React.Fragment>
                            ))
                        ) : (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyEmoji}>🎵</Text>
                                <Text style={styles.emptyText}>No songs in this playlist yet.</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    playlistSongs.slice(0, currentTrackIndex).length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Previously Played</Text>
                            {playlistSongs.slice(0, currentTrackIndex).map(item => (
                                <React.Fragment key={item.id}>
                                    {renderSong({ 
                                        item, 
                                        isCurrentID: item.music.id === currentTrack?.id, 
                                        isCurrentContext: false 
                                    })}
                                </React.Fragment>
                            ))}
                        </View>
                    )
                )}
            </ScrollView>
        );
    };

    if (selectedPlaylist) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setSelectedPlaylist(null)} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={28} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{selectedPlaylist.name}</Text>
                    <View style={{ width: 44 }} />
                </View>

                {renderPlaylistContent()}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="chevron-back" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Your Playlists</Text>
                <TouchableOpacity 
                    style={styles.addBtn} 
                    onPress={() => setModalVisible(true)}
                >
                    <Ionicons name="add-outline" size={30} color="#fff" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.list}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <SkeletonCard key={i} variant="row" />
                    ))}
                </View>
            ) : (
                <FlatList
                    data={playlists}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPlaylist}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyEmoji}>🎵</Text>
                            <Text style={styles.emptyText}>Create your first playlist to organize your music.</Text>
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

            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>New Playlist</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Playlist name"
                            placeholderTextColor="#666"
                            value={newPlaylistName}
                            onChangeText={setNewPlaylistName}
                            autoFocus
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleCreatePlaylist} style={styles.confirmBtn}>
                                <Text style={styles.confirmBtnText}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
    },
    addBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addBtnText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    closeBtn: {
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
        padding: 15,
        borderRadius: 22,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#282828',
    },
    playlistIcon: {
        width: 55,
        height: 55,
        backgroundColor: '#333',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconText: {
        fontSize: 24,
    },
    playlistMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    info: {
        marginLeft: 15,
        flex: 1,
    },
    name: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    count: {
        color: '#aaa',
        fontSize: 14,
        marginTop: 2,
    },
    playlistDeleteBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
        borderRadius: 20,
    },
    deleteBtnInternal: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#1E1E1E',
        width: '85%',
        padding: 25,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: '#333',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    modalInput: {
        backgroundColor: '#282828',
        color: '#fff',
        padding: 15,
        borderRadius: 15,
        fontSize: 16,
        marginBottom: 25,
        borderWidth: 1,
        borderColor: '#444',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cancelBtn: {
        padding: 12,
    },
    cancelBtnText: {
        color: '#aaa',
        fontSize: 16,
        fontWeight: '600',
    },
    confirmBtn: {
        backgroundColor: '#1DB954',
        paddingHorizontal: 25,
        paddingVertical: 12,
        borderRadius: 25,
    },
    confirmBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    songCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        padding: 12,
        borderRadius: 22,
        marginBottom: 12,
    },
    songMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    songThumbnailContainer: {
        position: 'relative',
        width: 60,
        height: 60,
        borderRadius: 6,
        overflow: 'hidden',
    },
    songCover: {
        width: '100%',
        height: '100%',
        backgroundColor: '#333',
    },
    songPlayOverlay: {
        position: 'absolute',
        bottom: 10,
        right: 5,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },
    visualizerOverlay: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        zIndex: 10,
        transform: [{ scale: 0.6 }], // Scaled for new thumbnail size
    },
    playIconSmall: {
        color: '#fff',
        fontSize: 14,
        marginLeft: 2,
    },
    songInfo: {
        marginLeft: 15,
        flex: 1,
    },
    songTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    songArtist: {
        color: '#ccc',
        fontSize: 11,
        marginTop: 2,
    },
    artistDot: {
        color: '#1DB954',
        fontSize: 12,
        fontWeight: 'bold',
    },
    releaseDate: {
        color: '#999',
        fontSize: 8.5,
        fontStyle: 'italic',
        marginTop: 4,
    },
    removeBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
        marginLeft: 8,
    },
    activeSongCard: {
        backgroundColor: '#282828',
        borderColor: '#1DB954',
        borderWidth: 1,
        elevation: 8,
        shadowColor: '#1DB954',
        shadowOpacity: 0.2,
        shadowRadius: 5,
    },
    activeSongText: {
        color: '#1DB954',
    },
    playingBadge: {
        backgroundColor: '#1DB954',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        marginRight: 10,
    },
    pausedBadge: {
        backgroundColor: '#444',
    },
    playingBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: 'bold',
    },
    section: {
        marginBottom: 25,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 15,
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
    },
    sectionSubtitle: {
        color: '#666',
        fontSize: 12,
        marginLeft: 10,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
});

export default PlaylistsScreen;
