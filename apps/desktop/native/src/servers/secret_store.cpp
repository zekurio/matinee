#include "servers/secret_store.h"

#include "app/paths.h"

#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLoggingCategory>
#include <QSaveFile>

#include <qt6keychain/keychain.h>

Q_LOGGING_CATEGORY(lcSecrets, "matinee.secrets")

namespace {

const QString service = QStringLiteral("Matinee");

QJsonObject readAll(const QString &path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

} // namespace

SecretStore::SecretStore(QObject *parent)
    : QObject(parent),
      m_filePath(QDir(paths::data()).filePath(QStringLiteral("tokens.json"))) {}

void SecretStore::read(const QString &key,
                       std::function<void(const QString &secret)> done) {
  auto *job = new QKeychain::ReadPasswordJob(service, this);
  job->setKey(key);
  connect(job, &QKeychain::Job::finished, this,
          [this, key, job, done = std::move(done)] {
            if (job->error() == QKeychain::NoError) {
              done(job->textData());
              return;
            }
            // Not in the keychain, or no keychain: the file may have it.
            done(readFile(key));
          });
  job->start();
}

void SecretStore::write(const QString &key, const QString &secret) {
  auto *job = new QKeychain::WritePasswordJob(service, this);
  job->setKey(key);
  job->setTextData(secret);
  connect(job, &QKeychain::Job::finished, this, [this, key, secret, job] {
    if (job->error() == QKeychain::NoError) {
      // A copy from before there was a keychain would outlive a sign-out.
      writeFile(key, QString());
      return;
    }
    qCWarning(lcSecrets).noquote()
        << "No keychain took the session (" << job->errorString()
        << "); keeping it in" << m_filePath;
    writeFile(key, secret);
  });
  job->start();
}

void SecretStore::remove(const QString &key) {
  auto *job = new QKeychain::DeletePasswordJob(service, this);
  job->setKey(key);
  job->start();
  writeFile(key, QString());
}

QString SecretStore::readFile(const QString &key) const {
  return readAll(m_filePath).value(key).toString();
}

void SecretStore::writeFile(const QString &key, const QString &secret) const {
  QJsonObject all = readAll(m_filePath);
  if (secret.isEmpty()) {
    if (!all.contains(key)) return;
    all.remove(key);
  } else {
    all.insert(key, secret);
  }
  if (all.isEmpty()) {
    QFile::remove(m_filePath);
    return;
  }
  QSaveFile file(m_filePath);
  // Only the user reads it, from the moment it exists.
  if (!file.open(QIODevice::WriteOnly) ||
      !file.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner) ||
      file.write(QJsonDocument(all).toJson()) < 0 || !file.commit()) {
    qCWarning(lcSecrets) << "Couldn't save" << m_filePath << file.errorString();
  }
}
