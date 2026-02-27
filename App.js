import React from 'react';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Platform } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import { PlayerProvider } from './src/context/PlayerContext';
import { FavoritesProvider } from './src/context/FavoritesContext';
import { PlaylistProvider } from './src/context/PlaylistContext';
import { MenuProvider } from './src/context/MenuContext';
import { ChatProvider } from './src/context/ChatContext';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  React.useEffect(() => {
    async function setupSystemUI() {
      if (Platform.OS === 'android') {
        try {
          // Force black style for navigation bar status
          await NavigationBar.setButtonStyleAsync('light');
          // Ensuring the bar is visible
          await NavigationBar.setVisibilityAsync('visible');
          // Note: setBackgroundColorAsync and setPositionAsync are handled by edgeToEdgeEnabled: true in app.json
          // but we can set SystemUI background for consistency in some views
          await SystemUI.setBackgroundColorAsync('#121212');
        } catch (e) {
          console.log('NavigationBar setup error:', e);
        }
      }
    }
    setupSystemUI();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MenuProvider>
          <FavoritesProvider>
            <PlaylistProvider>
              <PlayerProvider>
                <ChatProvider>
                  <View style={styles.container}>
                    <RootNavigator />
                    <StatusBar style="light" />
                  </View>
                </ChatProvider>
              </PlayerProvider>
            </PlaylistProvider>
          </FavoritesProvider>
        </MenuProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
});

registerRootComponent(App);
