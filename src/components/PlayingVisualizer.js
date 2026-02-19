import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

const PlayingVisualizer = ({ isPlaying }) => {
    const anim1 = useRef(new Animated.Value(4)).current;
    const anim2 = useRef(new Animated.Value(8)).current;
    const anim3 = useRef(new Animated.Value(5)).current;
    const anim4 = useRef(new Animated.Value(7)).current;

    const createAnimation = (value, toValue, duration) => {
        return Animated.sequence([
            Animated.timing(value, {
                toValue,
                duration,
                useNativeDriver: false,
            }),
            Animated.timing(value, {
                toValue: 2,
                duration,
                useNativeDriver: false,
            }),
        ]);
    };

    useEffect(() => {
        let animation;
        if (isPlaying) {
            animation = Animated.loop(
                Animated.parallel([
                    createAnimation(anim1, 14, 400),
                    createAnimation(anim2, 12, 550),
                    createAnimation(anim3, 16, 450),
                    createAnimation(anim4, 10, 500),
                ])
            );
            animation.start();
        } else {
            if (animation) animation.stop();
            // Reset to small bars when paused
            Animated.parallel([
                Animated.timing(anim1, { toValue: 4, duration: 300, useNativeDriver: false }),
                Animated.timing(anim2, { toValue: 4, duration: 300, useNativeDriver: false }),
                Animated.timing(anim3, { toValue: 4, duration: 300, useNativeDriver: false }),
                Animated.timing(anim4, { toValue: 4, duration: 300, useNativeDriver: false }),
            ]).start();
        }

        return () => {
            if (animation) animation.stop();
        };
    }, [isPlaying]);

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.bar, { height: anim1 }]} />
            <Animated.View style={[styles.bar, { height: anim2 }]} />
            <Animated.View style={[styles.bar, { height: anim3 }]} />
            <Animated.View style={[styles.bar, { height: anim4 }]} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        height: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 4,
        gap: 2,
    },
    bar: {
        width: 3,
        backgroundColor: '#1DB954',
        borderRadius: 1.5,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.8,
        shadowRadius: 1,
    },
});

export default PlayingVisualizer;
