#include "bridge/bridge.h"

#include <QJsonDocument>
#include <QLoggingCategory>

Q_LOGGING_CATEGORY(lcBridge, "matinee.bridge")

namespace {

QString errorCode(Bridge::Error error) {
  switch (error) {
  case Bridge::Error::Forbidden:
    return QStringLiteral("forbidden");
  case Bridge::Error::Invalid:
    return QStringLiteral("invalid");
  case Bridge::Error::UnknownMethod:
    return QStringLiteral("unknown-method");
  case Bridge::Error::Failed:
    return QStringLiteral("failed");
  }
  Q_UNREACHABLE();
}

QString text(const QJsonObject &message) {
  return QString::fromUtf8(QJsonDocument(message).toJson(QJsonDocument::Compact));
}

} // namespace

std::optional<QString> Bridge::Call::string(QLatin1String name) const {
  const QJsonValue value = m_params.value(name);
  return value.isString() ? std::optional(value.toString()) : std::nullopt;
}

std::optional<double> Bridge::Call::number(QLatin1String name) const {
  const QJsonValue value = m_params.value(name);
  return value.isDouble() ? std::optional(value.toDouble()) : std::nullopt;
}

std::optional<bool> Bridge::Call::boolean(QLatin1String name) const {
  const QJsonValue value = m_params.value(name);
  return value.isBool() ? std::optional(value.toBool()) : std::nullopt;
}

void Bridge::Call::resolve(const QJsonValue &result) const {
  if (!m_bridge) return;
  QJsonObject response{{QStringLiteral("id"), m_id}};
  if (!result.isUndefined()) response.insert(QStringLiteral("result"), result);
  m_bridge->answer(*this, response);
}

void Bridge::Call::reject(Error error, const QString &message) const {
  if (!m_bridge) return;
  if (error != Error::Failed) {
    qCWarning(lcBridge).noquote() << m_method << "refused:" << message;
  }
  m_bridge->answer(*this, {{QStringLiteral("id"), m_id},
                           {QStringLiteral("error"),
                            QJsonObject{{QStringLiteral("code"), errorCode(error)},
                                        {QStringLiteral("message"), message}}}});
}

void Bridge::Call::invalid() const {
  reject(Error::Invalid, QStringLiteral("The app couldn't read what %1 was sent.").arg(m_method));
}

Bridge::Bridge(QObject *parent) : QObject(parent) {}

void Bridge::handle(const QString &method, Scope scope, Handler handler) {
  m_methods.insert(method, {scope, std::move(handler)});
}

void Bridge::emitEvent(const QString &name, const QJsonValue &data, Scope scope) {
  if (!allows(scope)) return;
  Q_EMIT message(QString(), text({{QStringLiteral("event"), name},
                                   {QStringLiteral("data"), data}}));
}

void Bridge::send(const QString &page, const QString &message) {
  const QJsonObject request = QJsonDocument::fromJson(message.toUtf8()).object();
  const QJsonValue id = request.value(QLatin1String("id"));
  const QJsonValue method = request.value(QLatin1String("method"));
  // Without an id there is nothing to answer to.
  if (!id.isDouble() || !method.isString()) return;

  Call call;
  call.m_bridge = this;
  call.m_page = page;
  call.m_id = id.toInteger();
  call.m_method = method.toString();
  call.m_params = request.value(QLatin1String("params")).toObject();

  const auto found = m_methods.constFind(call.m_method);
  if (found == m_methods.constEnd()) {
    call.reject(Error::UnknownMethod,
                QStringLiteral("This version of the app has no %1.").arg(call.m_method));
    return;
  }
  if (!allows(found->scope)) {
    call.reject(Error::Forbidden,
                QStringLiteral("This page may not call %1.").arg(call.m_method));
    return;
  }
  found->handler(call);
}

bool Bridge::allows(Scope scope) const {
  switch (m_page) {
  case Page::Shell:
    return scope != Scope::Web;
  case Page::Web:
    return scope != Scope::Shell;
  case Page::Other:
    return false;
  }
  Q_UNREACHABLE();
}

void Bridge::answer(const Call &call, const QJsonObject &response) {
  Q_EMIT message(call.m_page, text(response));
}
