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
    const { playTrack, currentTrack, isPlaying, togglePlayPause, loadingTrackId } = usePlayer();

    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'android') {
                NavigationBar.setButtonStyleAsync('light');
            }
        }, [])
    );

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
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
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
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
                    <Image source={{ uri: item.cover_url }} style={styles.cardCover} />
                    {currentTrack?.id === item.id && (
                        <View style={styles.visualizerOverlay}>
                            <PlayingVisualizer isPlaying={isPlaying} />
                        </View>
                    )}
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
                        {loadingTrackId === item.id ? (
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
                <View style={styles.cardInfo}>
                    <Text style={[styles.musicTitle, currentTrack?.id === item.id && { color: '#1DB954' }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.musicArtist}>{item.artist}</Text>
                    <View style={styles.metaInfo}>
                        <View style={styles.metaTop}>
                            <View style={styles.genreBadge}>
                                <Text style={styles.musicGenre}>{item.genre}</Text>
                            </View>
                        </View>
                        <Text style={styles.releaseDate}>{formatDate(item.created_at)}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={styles.exploreCard}>
                    <TouchableOpacity 
                        style={styles.menuButton} 
                        onPress={openMenu}
                    >
                        <Ionicons name="menu-outline" size={28} color="#fff" />
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
        marginBottom: 20,
    },
    exploreCard: {
        backgroundColor: '#1E1E1E',
        borderRadius: 20,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#333',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
    },
    menuButton: {
        position: 'absolute',
        left: 15,
        width: 44,
        height: 44,
        backgroundColor: '#282828',
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    headerLogo: {
        position: 'absolute',
        right: 15,
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: '#1DB954',
    },
    exploreTextContainer: {
        flex: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 1,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1DB954',
        marginTop: 2,
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    searchContainer: {
        marginBottom: 15,
    },
    searchInput: {
        backgroundColor: '#1E1E1E',
        color: '#fff',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 25,
        fontSize: 15,
        borderWidth: 1,
        borderColor: '#333',
    },
    genreCarouselContainer: {
        marginBottom: 20,
    },
    genreList: {
        paddingRight: 20,
    },
    genreChip: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#1E1E1E',
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#333',
    },
    activeGenreChip: {
        backgroundColor: '#1DB954',
        borderColor: '#1DB954',
    },
    genreText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    activeGenreText: {
        color: '#000',
    },
    row: {
        justifyContent: 'space-between',
    },
    list: {
        paddingBottom: 100,
    },
    card: {
        backgroundColor: '#1E1E1E',
        width: '48%',
        borderRadius: 15,
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
        elevation: 15,
        shadowColor: '#1DB954',
        shadowOpacity: 0.4,
        shadowRadius: 10,
        zIndex: 2,
    },
    inactiveCard: {
        opacity: 0.6,
    },
    imageContainer: {
        width: '100%',
        height: 160,
        backgroundColor: '#333',
        position: 'relative',
        overflow: 'hidden',
    },
    cardCover: {
        width: '100%',
        height: '100%',
    },
    playOverlay: {
        position: 'absolute',
        bottom: 10,
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
    visualizerOverlay: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        zIndex: 10,
    },
    playIcon: {
        color: '#000',
        fontSize: 18,
        marginLeft: 2,
    },
    cardInfo: {
        padding: 12,
    },
    musicTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: 'bold',
    },
    musicArtist: {
        color: '#aaa',
        fontSize: 13,
        marginTop: 2,
    },
    genreBadge: {
        backgroundColor: '#282828',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginTop: 8,
    },
    metaInfo: {
        marginTop: 8,
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
        color: '#666',
        fontSize: 10,
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
