import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const SkeletonCard = ({ variant = 'grid' }) => {
    const fadeAnim = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(fadeAnim, {
                    toValue: 0.7,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0.3,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, []);

    if (variant === 'row') {
        return (
            <View style={styles.rowCard}>
                <Animated.View style={[styles.rowCover, { opacity: fadeAnim }]} />
                <View style={styles.rowInfo}>
                    <Animated.View style={[styles.titleLine, { width: '60%', opacity: fadeAnim }]} />
                    <Animated.View style={[styles.artistLine, { width: '40%', opacity: fadeAnim }]} />
                    <Animated.View style={[styles.dateLine, { width: '30%', opacity: fadeAnim }]} />
                </View>
                <Animated.View style={[styles.rowPlayBtn, { opacity: fadeAnim }]} />
            </View>
        );
    }

    return (
        <View style={styles.card}>
            {/* Main background/cover skeleton */}
            <Animated.View style={[styles.cover, { opacity: fadeAnim }]} />
            
            {/* Smooth overlay at the bottom */}
            <View style={styles.cardOverlay}>
                <View style={styles.cardInfo}>
                    <Animated.View style={[styles.titleLine, { opacity: fadeAnim }]} />
                    <Animated.View style={[styles.artistLine, { opacity: fadeAnim }]} />
                    <Animated.View style={[styles.dateLine, { opacity: fadeAnim, width: '40%' }]} />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#1E1E1E',
        width: '48%',
        height: 210,
        borderRadius: 22,
        marginBottom: 15,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#282828',
        position: 'relative',
    },
    cover: {
        width: '100%',
        height: '100%',
        backgroundColor: '#333',
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
    cardInfo: {
        padding: 0,
    },
    titleLine: {
        height: 18,
        backgroundColor: '#444',
        borderRadius: 4,
        width: '85%',
        marginBottom: 6,
    },
    artistLine: {
        height: 12,
        backgroundColor: '#3a3a3a',
        borderRadius: 3,
        width: '60%',
        marginBottom: 8,
    },
    cardFooter: {
        marginTop: 4,
    },
    footerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    genreBadge: {
        height: 14,
        width: 45,
        backgroundColor: '#3a3a3a',
        borderRadius: 4,
    },
    dateLine: {
        height: 10,
        backgroundColor: '#333',
        borderRadius: 2,
        width: '40%',
    },
    rowCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        padding: 12,
        borderRadius: 22,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#282828',
    },
    rowCover: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#333',
    },
    rowInfo: {
        flex: 1,
        marginLeft: 15,
    },
    rowPlayBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#333',
    },
});

export default SkeletonCard;
