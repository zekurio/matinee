#pragma once

#include <QObject>
#include <QString>

#include <functional>

// Where the sessions' tokens are kept: the system's keychain (Secret
// Service or KWallet on Linux, Keychain on macOS, Credential Manager on
// Windows). A Linux session without a keychain is common on bare window
// managers, and there the token goes into a file only the user can read,
// which is what a browser does there too.
class SecretStore : public QObject {
  Q_OBJECT

public:
  explicit SecretStore(QObject *parent = nullptr);

  // Calls `done` with the secret, or an empty string when there is none.
  void read(const QString &key, std::function<void(const QString &secret)> done);
  void write(const QString &key, const QString &secret);
  void remove(const QString &key);

private:
  QString readFile(const QString &key) const;
  void writeFile(const QString &key, const QString &secret) const;

  QString m_filePath;
};
