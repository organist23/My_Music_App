-- Profiles Table
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone." ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile." ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Music Table
CREATE TABLE music (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  genre TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE music ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Music is viewable by everyone." ON music
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert music." ON music
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update music." ON music
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete music." ON music
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Favorites Table
CREATE TABLE favorites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  music_id UUID REFERENCES music(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, music_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites." ON favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites." ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites." ON favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Playlists Table
CREATE TABLE playlists (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own playlists." ON playlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own playlists." ON playlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own playlists." ON playlists
  FOR DELETE USING (auth.uid() = user_id);

-- Playlist Songs Table
CREATE TABLE playlist_songs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE NOT NULL,
  music_id UUID REFERENCES music(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(playlist_id, music_id)
);

ALTER TABLE playlist_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view songs in their own playlists." ON playlist_songs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM playlists
      WHERE id = playlist_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add songs to their own playlists." ON playlist_songs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM playlists
      WHERE id = playlist_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove songs from their own playlists." ON playlist_songs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM playlists
      WHERE id = playlist_id AND user_id = auth.uid()
    )
  );

-- Music Requests Table
CREATE TABLE music_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  music_id UUID REFERENCES music(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE music_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own requests." ON music_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own requests." ON music_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own requests." ON music_requests
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own requests." ON music_requests
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all requests." ON music_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update requests." ON music_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete requests." ON music_requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Download Permissions Table
CREATE TABLE download_permissions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  music_id UUID REFERENCES music(id) ON DELETE CASCADE NOT NULL,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, music_id)
);

ALTER TABLE download_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own permissions." ON download_permissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all permissions." ON download_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
