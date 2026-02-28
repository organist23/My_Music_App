import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../context/PlayerContext';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const MiniPlayer = ({ currentRouteName }) => {
    const { currentTrack, isPlaying, togglePlayPause, position, duration } = usePlayer();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();

    if (!currentTrack || currentRouteName === 'Player') return null;

    const progress = (position / duration) * 100 || 0;

    return (
        <TouchableOpacity 
            style={[styles.container, { bottom: 50 + insets.bottom }]} 
            activeOpacity={0.9}
            onPress={() => navigation.navigate('Player')}
        >
            <View style={styles.content}>
                <Image source={{ uri: currentTrack.cover_url }} style={styles.cover} />
                <View style={styles.info}>
                    <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>
                        {currentTrack.artist} • <Text style={styles.genreText}>{currentTrack.genre || 'Music'}</Text>
                    </Text>
                </View>
                <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause}>
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
                </TouchableOpacity>
            </View>
            <View style={styles.progressBarBg}>
                <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 8,
        right: 8,
        backgroundColor: '#282828',
        borderRadius: 8,
        height: 60,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    content: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
    },
    cover: {
        width: 40,
        height: 40,
        borderRadius: 4,
        backgroundColor: '#333',
    },
    info: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'center',
    },
    title: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    artist: {
        color: '#aaa',
        fontSize: 12,
    },
    genreText: {
        color: '#1DB954',
        fontWeight: 'bold',
        fontSize: 11,
    },
    playBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressBarBg: {
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        width: '100%',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#1DB954',
    }
});

export default MiniPlayer;
