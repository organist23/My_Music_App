import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const SkeletonCard = () => {
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [opacity]);

    return (
        <View style={styles.card}>
            <Animated.View style={[styles.cover, { opacity }]} />
            <View style={styles.cardInfo}>
                <Animated.View style={[styles.titleLine, { opacity }]} />
                <Animated.View style={[styles.artistLine, { opacity }]} />
                <View style={styles.footer}>
                    <Animated.View style={[styles.genreBadge, { opacity }]} />
                    <Animated.View style={[styles.dateLine, { opacity }]} />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#1E1E1E',
        width: '48%',
        borderRadius: 15,
        marginBottom: 15,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#282828',
    },
    cover: {
        width: '100%',
        height: 160,
        backgroundColor: '#333',
    },
    cardInfo: {
        padding: 12,
    },
    titleLine: {
        height: 16,
        backgroundColor: '#333',
        borderRadius: 4,
        width: '80%',
        marginBottom: 8,
    },
    artistLine: {
        height: 12,
        backgroundColor: '#282828',
        borderRadius: 4,
        width: '60%',
        marginBottom: 12,
    },
    footer: {
        marginTop: 4,
    },
    genreBadge: {
        height: 14,
        width: 40,
        backgroundColor: '#282828',
        borderRadius: 4,
        marginBottom: 8,
    },
    dateLine: {
        height: 10,
        backgroundColor: '#282828',
        borderRadius: 4,
        width: '50%',
    },
});

export default SkeletonCard;
