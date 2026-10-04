import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/logger.dart';

const _tag = 'AuthService';

/// Supabase authentication service.
/// Uses the same Supabase instance as the web app.
class AuthService {
  AuthService._();

  static SupabaseClient get _client => Supabase.instance.client;

  /// Current user, or null if not logged in.
  static User? get currentUser => _client.auth.currentUser;

  /// Whether a user is currently authenticated.
  static bool get isLoggedIn => currentUser != null;

  /// Auth state change stream.
  static Stream<AuthState> get authStateChanges =>
      _client.auth.onAuthStateChange;

  /// Sign up with email and password.
  static Future<AuthResponse> signUp(String email, String password) async {
    final response = await _client.auth.signUp(
      email: email,
      password: password,
    );
    Log.d(_tag, 'Signed up user: ${response.user?.email}');
    return response;
  }

  /// Sign in with email and password.
  static Future<AuthResponse> signIn(String email, String password) async {
    final response = await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );
    Log.d(_tag, 'Signed in user: ${response.user?.email}');
    return response;
  }

  /// Sign out.
  static Future<void> signOut() async {
    await _client.auth.signOut();
    Log.d(_tag, 'Signed out');
  }
}
