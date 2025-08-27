package com.microsoft.codepush.react;

import java.io.EOFException;
import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.zip.ZipException;

public class CodePushNetworkException extends IOException {
    private final int httpStatusCode;

    public CodePushNetworkException(String message, int httpStatusCode) {
        super(message + " (HTTP " + httpStatusCode + ")");
        this.httpStatusCode = httpStatusCode;
    }

    public int getHttpStatusCode() {
        return httpStatusCode;
    }
}
