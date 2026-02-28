import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform, RefreshControl } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import { useMenu } from '../../context/MenuContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SkeletonCard from '../../components/SkeletonCard';
import PlayingVisualizer from '../../components/PlayingVisualizer';

const HomeScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { openMenu } = useMenu();
    const [music, setMusic] = useState([]);
    const [genres, setGenres] = useState(['All']);
    const [selectedGenre, setSelectedGenre] = useState('All');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [permissions, setPermissions] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const { user } = useAuth();
    const { 
        playTrack, currentTrack, isPlaying, togglePlayPause, 
        loadingTrackId, isBuffering, reconnectIfStalled, syncQueue 
    } = usePlayer();

    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'android') {
                NavigationBar.setButtonStyleAsync('light');
            }
            // Sync data whenever screen comes into focus, but only show loader if empty
            fetchData(music.length === 0);
        }, [music.length])
    );

    useEffect(() => {
        // We rely on useFocusEffect for the initial load to prevent duplicate fetches on mount/focus.
        // But we still set up the real-time subscription once here.
        
        // Real-time subscription for music deletions/updates
        const musicSubscription = supabase
            .channel('home_music_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'music' },
                () => {
                    fetchData(false); // Silent refresh for sync
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(musicSubscription);
        };
    }, []);

    const fetchData = async (showLoading = true) => {
        try {
            // Only show the loading indicator if we don't have music data yet
            if (showLoading && music.length === 0) setLoading(true);
            const [musicRes, permRes, reqRes] = await Promise.all([
                supabase.from('music').select('*').order('created_at', { ascending: false }),
                user ? supabase.from('download_permissions').select('music_id').eq('user_id', user.id) : Promise.resolve({ data: [] }),
                user ? supabase.from('music_requests').select('music_id').eq('user_id', user.id).eq('status', 'pending') : Promise.resolve({ data: [] })
            ]);

            if (musicRes.error) throw musicRes.error;
            
            setMusic(musicRes.data);
            setPermissions((permRes.data || []).map(p => p.music_id));
            setPendingRequests((reqRes.data || []).map(r => r.music_id));
            
            const uniqueGenres = ['All', ...new Set(musicRes.data.map(item => item.genre))];
            setGenres(uniqueGenres);

            // Manual Refresh Support: 
            // 1. Reconnect if playback is stalled (e.g. user refreshed to fix internet)
            if (refreshing) {
                reconnectIfStalled();
            }
            
            // 2. Sync the queue if we are playing from the dashboard
            syncQueue(musicRes.data, { type: 'dashboard' });
        } catch (error) {
            console.error('Fetch error:', error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [user]);

    const handleCardPress = (track) => {
        if (currentTrack?.id !== track.id) {
            playTrack(track, filteredMusic, { type: 'dashboard' });
        }
        navigation.navigate('Player');
    };

    const handleTogglePlay = (track) => {
        if (currentTrack?.id === track.id) {
            togglePlayPause();
        } else {
            playTrack(track, filteredMusic, { type: 'dashboard' });
        }
    };

    const filteredMusic = music.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.artist.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesGenre = selectedGenre === 'All' || item.genre === selectedGenre;
        return matchesSearch && matchesGenre;
    });

    const renderGenreItem = ({ item }) => (
        <TouchableOpacity 
            style={[
                styles.genreChip, 
                selectedGenre === item && styles.activeGenreChip
            ]}
            onPress={() => setSelectedGenre(item)}
        >
            <Text style={[
                styles.genreText,
                selectedGenre === item && styles.activeGenreText
            ]}>{item}</Text>
        </TouchableOpacity>
    );

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return `${day} • ${time}`;
    };

    const isNewTrack = (dateString) => {
        const trackDate = new Date(dateString);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return trackDate > sevenDaysAgo;
    };

    const renderItem = ({ item }) => {
        const isNew = isNewTrack(item.created_at);
        const isDownloadable = permissions.includes(item.id);
        const isRequested = pendingRequests.includes(item.id);
        const isCurrent = currentTrack?.id === item.id;
        const isAnyPlaying = !!currentTrack;
        
        return (
            <TouchableOpacity 
                style={[
                    styles.card,
                    isCurrent && styles.activeCard,
                    isAnyPlaying && !isCurrent && styles.inactiveCard
                ]}
                onPress={() => handleCardPress(item)}
            >
                <View style={styles.imageContainer}>
                    <Image source={{ uri: item.cover_url }} style={styles.cardCover} resizeMode="cover" />
                    
                    {/* Overlay Info Container */}
                    <View style={[styles.cardOverlay, isCurrent && styles.activeCardOverlay]}>
                        <View style={styles.cardInfo}>
                            {currentTrack?.id === item.id && (
                                <View style={styles.visualizerContainer}>
                                    <PlayingVisualizer isPlaying={isPlaying} />
                                </View>
                            )}
                            <Text 
                                style={[styles.musicTitle, isCurrent && { color: '#1DB954' }]} 
                                numberOfLines={1}
                            >
                                {item.title}
                            </Text>
                            <Text style={styles.musicArtist} numberOfLines={1}>
                                {item.artist} <Text style={styles.artistDot}>•</Text> {item.genre}
                            </Text>
                            <Text style={styles.releaseDate}>{formatDate(item.created_at)}</Text>
                        </View>
                    </View>
                    {isNew && (
                        <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                    )}
                    
                    {isDownloadable ? (
                        <View style={styles.statusIconContainer}>
                            <Ionicons name="download" size={14} color="#1DB954" />
                        </View>
                    ) : isRequested ? (
                        <View style={styles.statusIconContainer}>
                             <Ionicons name="time" size={14} color="#1DB954" />
                        </View>
                    ) : null}

                    <TouchableOpacity 
                        style={styles.playOverlay}
                        onPress={() => handleTogglePlay(item)}
                    >
                        {(loadingTrackId === item.id || (isCurrent && isBuffering)) ? (
                            <ActivityIndicator size="small" color="#000" />
                        ) : (
                            <Ionicons 
                                name={currentTrack?.id === item.id && isPlaying ? 'pause' : 'play'} 
                                size={18} 
                                color="#000" 
                                style={!(currentTrack?.id === item.id && isPlaying) && { marginLeft: 2 }}
                            />
                        )}
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 5 }]}>
                <View style={styles.exploreCard}>
                    <TouchableOpacity 
                        style={styles.menuButton} 
                        onPress={openMenu}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="menu-outline" size={26} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.exploreTextContainer}>
                        <Text style={styles.title}>Keiphil Guimba</Text>
                        <Text style={styles.subtitle}>Original Composition</Text>
                    </View>
                    <Image 
                        source={require('../../../logo/login.png')} 
                        style={styles.headerLogo}
                    />
                </View>
            </View>

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search songs, artists..."
                    placeholderTextColor="#666"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            <View style={styles.genreCarouselContainer}>
                <FlatList
                    data={genres}
                    keyExtractor={(item) => item}
                    renderItem={renderGenreItem}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.genreList}
                />
            </View>

            {loading ? (
                <View style={styles.list}>
                    <View style={styles.row}>
                        <SkeletonCard />
                        <SkeletonCard />
                    </View>
                    <View style={styles.row}>
                        <SkeletonCard />
                        <SkeletonCard />
                    </View>
                    <View style={styles.row}>
                        <SkeletonCard />
                        <SkeletonCard />
                    </View>
                </View>
            ) : (
                <FlatList
                    data={filteredMusic}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={<Text style={styles.emptyText}>No music found.</Text>}
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
        paddingHorizontal: 15,
    },
    header: {
        marginBottom: 8,
    },
    exploreCard: {
        backgroundColor: '#1E1E1E',
        borderRadius: 10,
        paddingVertical: 12,
        minHeight: 50,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#333',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    menuButton: {
        position: 'absolute',
        left: 10,
        width: 34,
        height: 34,
        backgroundColor: '#282828',
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    headerLogo: {
        position: 'absolute',
        right: 10,
        width: 30,
        height: 30,
        borderRadius: 15,
        zIndex: 10,
        borderWidth: 1.5,
        borderColor: '#1DB954',
    },
    exploreTextContainer: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 2,
        textAlign: 'center',
        textTransform: 'uppercase',
        textShadowColor: 'rgba(29, 185, 84, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    subtitle: {
        fontSize: 11,
        fontStyle: 'italic',
        fontWeight: 'normal',
        color: '#999',
        marginTop: 0,
        textAlign: 'center',
        letterSpacing: 1,
    },
    searchContainer: {
        marginBottom: 8,
    },
    searchInput: {
        backgroundColor: '#1E1E1E',
        color: '#fff',
        paddingHorizontal: 15,
        paddingVertical: 6,
        borderRadius: 18,
        fontSize: 13,
        borderWidth: 1,
        borderColor: '#333',
    },
    genreCarouselContainer: {
        marginBottom: 10,
    },
    genreList: {
        paddingRight: 20,
    },
    genreChip: {
        paddingHorizontal: 15,
        paddingVertical: 7,
        borderRadius: 14,
        backgroundColor: '#1E1E1E',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    activeGenreChip: {
        backgroundColor: '#1DB954',
        borderColor: '#1DB954',
    },
    genreText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    activeGenreText: {
        color: '#000',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    list: {
        paddingBottom: 100,
    },
    card: {
        backgroundColor: '#1E1E1E',
        width: '48%',
        borderRadius: 22,
        marginBottom: 15,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        borderWidth: 1,
        borderColor: '#282828',
    },
    activeCard: {
        borderColor: '#1DB954',
        borderWidth: 2,
        elevation: 18,
        shadowColor: '#1DB954',
        shadowOpacity: 0.6,
        shadowRadius: 15,
        zIndex: 2,
    },
    activeCardOverlay: {
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    inactiveCard: {
        opacity: 0.6,
    },
    imageContainer: {
        width: '100%',
        height: 210,
        backgroundColor: '#333',
        position: 'relative',
        overflow: 'hidden',
    },
    cardOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: 15, 
        paddingBottom: 15,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(0,0,0,0.6)', 
        borderTopLeftRadius: 35,
        borderTopRightRadius: 35,
    },
    cardCover: {
        width: '100%',
        height: '100%',
    },
    playOverlay: {
        position: 'absolute',
        bottom: 15,
        right: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    visualizerContainer: {
        alignSelf: 'flex-start',
        marginBottom: 8,
        height: 20,
    },
    playIcon: {
        color: '#000',
        fontSize: 18,
        marginLeft: 2,
    },
    cardInfo: {
        padding: 0,
    },
    musicTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: 'bold',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
        marginBottom: 6,
    },
    musicArtist: {
        color: '#ccc',
        fontSize: 11,
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    artistDot: {
        color: '#1DB954',
        fontSize: 12,
        fontWeight: 'bold',
    },
    genreBadge: {
        backgroundColor: '#282828',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginTop: 4,
    },
    metaInfo: {
        marginTop: 4,
    },
    metaTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    musicGenre: {
        color: '#1DB954',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    releaseDate: {
        color: '#999',
        fontSize: 8.5,
        fontStyle: 'italic',
    },
    newBadge: {
        position: 'absolute',
        top: 10,
        left: 10,
        backgroundColor: '#1DB954',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        elevation: 5,
        zIndex: 1,
    },
    newBadgeText: {
        color: '#000',
        fontSize: 10,
        fontWeight: 'bold',
    },
    statusIconContainer: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 5,
        borderRadius: 12,
        zIndex: 1,
    },
    emptyText: {
        color: '#aaa',
        textAlign: 'center',
        marginTop: 50,
        fontSize: 16,
    },
});

export default HomeScreen;
