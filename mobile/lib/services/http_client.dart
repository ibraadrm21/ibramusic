import 'package:dio/dio.dart';
import '../core/constants.dart';
import '../core/logger.dart';

/// Configured Dio HTTP client with retry logic and timeouts.
/// Used by all services that make network requests.
class HttpClient {
  HttpClient._();

  static final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: ApiConstants.defaultTimeout,
      receiveTimeout: ApiConstants.defaultTimeout,
      sendTimeout: ApiConstants.defaultTimeout,
      headers: {
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    ),
  );

  static Dio get instance => _dio;

  /// GET request with automatic retry on failure.
  static Future<Response> get(
    String url, {
    Duration? timeout,
    Map<String, dynamic>? queryParameters,
    Map<String, String>? headers,
    int retries = 1,
  }) async {
    for (int attempt = 0; attempt <= retries; attempt++) {
      try {
        return await _dio.get(
          url,
          queryParameters: queryParameters,
          options: Options(
            receiveTimeout: timeout,
            headers: headers,
          ),
        );
      } on DioException catch (e) {
        if (attempt == retries) {
          Log.e('HttpClient', 'GET $url failed after ${retries + 1} attempts', e);
          rethrow;
        }
        Log.w('HttpClient', 'GET $url attempt ${attempt + 1} failed, retrying...');
      }
    }
    throw Exception('Unreachable');
  }

  /// POST request with automatic retry.
  static Future<Response> post(
    String url, {
    dynamic data,
    Duration? timeout,
    Map<String, String>? headers,
    int retries = 0,
  }) async {
    for (int attempt = 0; attempt <= retries; attempt++) {
      try {
        return await _dio.post(
          url,
          data: data,
          options: Options(
            receiveTimeout: timeout,
            headers: headers,
          ),
        );
      } on DioException catch (e) {
        if (attempt == retries) {
          Log.e('HttpClient', 'POST $url failed after ${retries + 1} attempts', e);
          rethrow;
        }
        Log.w('HttpClient', 'POST $url attempt ${attempt + 1} failed, retrying...');
      }
    }
    throw Exception('Unreachable');
  }

  /// Simple GET that returns parsed JSON or null on failure.
  static Future<Map<String, dynamic>?> getJson(
    String url, {
    Duration? timeout,
    Map<String, String>? headers,
  }) async {
    try {
      final response = await get(url, timeout: timeout, headers: headers);
      if (response.statusCode == 200 && response.data != null) {
        if (response.data is Map<String, dynamic>) {
          return response.data as Map<String, dynamic>;
        }
        if (response.data is String) {
          // Dio sometimes returns raw string if content-type is wrong
          return null;
        }
      }
    } catch (e) {
      Log.w('HttpClient', 'getJson $url failed', e);
    }
    return null;
  }
}
