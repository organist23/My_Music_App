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
                paddingTop: 5,
                height: 60 + insets.bottom,
                paddingBottom: insets.bottom > 0 ? insets.bottom - 5 : 10,
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

                return <Ionicons name={iconName} size={size} color={color} />;
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
    const { user, role, loading } = useAuth();
    const { menuVisible, closeMenu } = useMenu();

    if (loading) {
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
