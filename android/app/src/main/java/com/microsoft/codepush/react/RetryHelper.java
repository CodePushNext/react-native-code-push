package com.microsoft.codepush.react;

import java.io.EOFException;
import java.io.IOException;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.zip.ZipException;

public class RetryHelper {
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final long BASE_RETRY_DELAY_MS = 1000;

    public interface RetryableOperation {
        void execute() throws IOException;
    }

    public static void executeWithRetry(RetryableOperation operation) throws IOException {
        IOException lastException = null;
        
        for (int attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                operation.execute();
                return;
            } catch (IOException e) {
                lastException = e;
                
                boolean shouldRetry = isRetryableException(e) && attempt < MAX_RETRY_ATTEMPTS;
                
                if (shouldRetry) {
                    CodePushUtils.log("Download attempt " + attempt + " failed, retrying: " + e.getMessage());
                    
                    try {
                        // Exponential backoff
                        long delay = BASE_RETRY_DELAY_MS * (1L << (attempt - 1));
                        Thread.sleep(delay);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new IOException("Download interrupted", ie);
                    }
                } else {
                    throw lastException;
                }
            }
        }
        
        throw lastException;
    }

    private static boolean isRetryableException(IOException e) {
        if (e instanceof CodePushNetworkException) {
            CodePushNetworkException ne = (CodePushNetworkException) e;
            int statusCode = ne.getHttpStatusCode();
            if (statusCode > 0) {
                return statusCode >= 500 || statusCode == 408 || statusCode == 429;
            }
        }
        
        return isRetryableError(e, 0);
    }
    
    private static boolean isRetryableError(Throwable e, int depth) {
        // Prevent stack overflow in recursive calls
        if (e == null || depth > 10) {
            return false;
        }
        
        if (e instanceof SocketTimeoutException ||
            e instanceof ConnectException ||
            e instanceof UnknownHostException ||
            e instanceof SocketException ||
            e instanceof EOFException) {
            return true;
        }
        
        return isRetryableError(e.getCause(), depth + 1);
    }

    public static void checkHttpResponse(HttpURLConnection connection) throws IOException {
        int responseCode = connection.getResponseCode();
        if (responseCode >= 400) {
            throw new CodePushNetworkException("HTTP error during download", responseCode);
        }
    }
}
