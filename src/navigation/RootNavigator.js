import React, { useState } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import MenuModal from '../components/MenuModal';

const MyTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        background: '#121212',
        card: '#121212',
    },
};

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';

// Admin Screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import UploadMusicScreen from '../screens/admin/UploadMusicScreen';
import SettingsMaintenanceScreen from '../screens/admin/SettingsScreen';

// User Screens
import HomeScreen from '../screens/user/HomeScreen';
import FavoritesScreen from '../screens/user/FavoritesScreen';
import PlaylistsScreen from '../screens/user/PlaylistsScreen';
import MusicPlayerScreen from '../screens/user/MusicPlayerScreen';

import { Ionicons } from '@expo/vector-icons';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
);

const AdminStack = () => (
    <Stack.Navigator screenOptions={{ 
        headerStyle: { backgroundColor: '#121212' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
    }}>
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ headerShown: false }} />
        <Stack.Screen name="UploadMusic" component={UploadMusicScreen} options={{ title: 'Upload Music' }} />
        <Stack.Screen name="Settings" component={SettingsMaintenanceScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
);

import { useMenu } from '../context/MenuContext';

const UserTabs = () => {
    const insets = useSafeAreaInsets();
    
    return (
        <Tab.Navigator screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: '#121212' },
            headerTintColor: '#fff',
            tabBarStyle: { 
                backgroundColor: '#121212', 
                borderTopColor: '#333',
                paddingTop: 4,
                height: 50 + insets.bottom,
                paddingBottom: insets.bottom > 0 ? insets.bottom - 2 : 6,
            },
            tabBarLabelStyle: {
                fontSize: 10,
                fontWeight: '500',
            },
            tabBarActiveTintColor: '#1DB954',
            tabBarInactiveTintColor: '#aaa',
            tabBarIcon: ({ focused, color, size }) => {
                let iconName;

                if (route.name === 'Home') {
                    iconName = focused ? 'home' : 'home-outline';
                } else if (route.name === 'Favorites') {
                    iconName = focused ? 'heart' : 'heart-outline';
                } else if (route.name === 'Playlists') {
                    iconName = focused ? 'list' : 'list-outline';
                }

                return <Ionicons name={iconName} size={20} color={color} />;
            },
        })}>
            <Tab.Screen 
                name="Home" 
                component={HomeScreen} 
                options={{ headerShown: false }} 
            />
            <Tab.Screen 
                name="Favorites" 
                component={FavoritesScreen} 
                options={{ headerShown: false }} 
            />
            <Tab.Screen 
                name="Playlists" 
                component={PlaylistsScreen} 
                options={{ headerShown: false }} 
            />
        </Tab.Navigator>
    );
};

const RootNavigator = () => {
    const { user, role, loading, isSyncingProfile } = useAuth();
    const { menuVisible, closeMenu } = useMenu();

    // Show loading spinner if:
    // 1. Initial auth check is happening (loading)
    // 2. We have a user but don't know their role yet (isSyncingProfile && !role)
    if (loading || (user && !role && isSyncingProfile)) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
                <ActivityIndicator size="large" color="#1DB954" />
            </View>
        );
    }

    return (
        <NavigationContainer theme={MyTheme}>
            <View style={{ flex: 1 }}>
                <Stack.Navigator screenOptions={{ headerShown: false }}>
                    {!user ? (
                        <Stack.Screen name="Auth" component={AuthStack} />
                    ) : (
                        <>
                            {/* If role is explicitly admin, show admin stack, else default to user stack immediately */}
                            {role === 'admin' ? (
                                <Stack.Screen name="Admin" component={AdminStack} />
                            ) : (
                                <Stack.Screen name="User" component={UserTabs} />
                            )}
                            <Stack.Screen 
                                name="Player" 
                                component={MusicPlayerScreen} 
                                options={{ 
                                    presentation: 'modal',
                                    animation: 'slide_from_bottom',
                                    contentStyle: { backgroundColor: '#121212' }
                                }} 
                            />
                        </>
                    )}
                </Stack.Navigator>
                {user && <MenuModal visible={menuVisible} onClose={closeMenu} />}
            </View>
        </NavigationContainer>
    );
};

export default RootNavigator;
