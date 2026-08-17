import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseSyncService {
  static const String _url = "https://nkhonqrseaymilneurgj.supabase.co";
  static const String _anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raG9ucXJzZWF5bWlsbmV1cmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDQ1NTgsImV4cCI6MjA5NzEyMDU1OH0.zdzwopG3BXoTmqzuoEPQ0FcsBUhmjgrgMirWZFTZcPo";

  static Future<void> init() async {
    await Supabase.initialize(url: _url, anonKey: _anonKey);
  }

  static SupabaseClient get client => Supabase.instance.client;

  /// Fetches saved user playlists & favorites from Supabase for current account
  static Future<Map<String, dynamic>?> fetchCloudData() async {
    final user = client.auth.currentUser;
    if (user == null) return null;

    try {
      final res = await client.from('user_sync').select('data').eq('id', user.id).single();
      return res['data'] as Map<String, dynamic>?;
    } catch (e) {
      print("Error fetching cloud data: $e");
      return null;
    }
  }

  /// Signs in user with email & password
  static Future<bool> signIn(String email, String password) async {
    try {
      final response = await client.auth.signInWithPassword(email: email, password: password);
      return response.user != null;
    } catch (e) {
      print("Sign in error: $e");
      return false;
    }
  }
}
