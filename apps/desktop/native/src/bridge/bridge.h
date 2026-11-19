#pragma once

#include <QHash>
#include <QJsonObject>
#include <QJsonValue>
#include <QObject>
#include <QPointer>

#include <functional>
#include <optional>

// The shell's end of what packages/desktop-bridge/src/protocol.ts
// describes: pages call methods and get answers, and the shell sends
// events. That file is the protocol; this carries it and checks who may
// call what.
//
// The pages reach it through Qt WebChannel as the object `bridge`, which
// the script in transport.js wraps into `window.matineeDesktop`.
class Bridge : public QObject {
  Q_OBJECT

public:
  // The kind of page the view shows: one of the app's own, the web app
  // of the server it's connected to, or anything else, which may call
  // nothing.
  enum class Page { Other, Shell, Web };

  // Which pages may call a method or get an event.
  enum class Scope { Shell, Web, Both };

  // The codes of BRIDGE_ERROR_CODES.
  enum class Error { Forbidden, Invalid, UnknownMethod, Failed };

  // One request, to answer once, now or later.
  class Call {
  public:
    const QJsonObject &params() const { return m_params; }

    // A parameter of the kind asked for, or nothing when it's missing or
    // of another kind.
    std::optional<QString> string(QLatin1String name) const;
    std::optional<double> number(QLatin1String name) const;
    std::optional<bool> boolean(QLatin1String name) const;

    void resolve(const QJsonValue &result = QJsonValue(QJsonValue::Undefined)) const;
    void reject(Error error, const QString &message) const;
    // For parameters the method can't read.
    void invalid() const;

  private:
    friend class Bridge;

    QPointer<Bridge> m_bridge;
    QString m_page;
    qint64 m_id = 0;
    QString m_method;
    QJsonObject m_params;
  };

  using Handler = std::function<void(const Call &call)>;

  explicit Bridge(QObject *parent = nullptr);

  // What the view shows now. The view's owner keeps it current.
  void setPage(Page page) { m_page = page; }
  Page page() const { return m_page; }

  void handle(const QString &method, Scope scope, Handler handler);
  // Sends an event to the page, when it's one that may get it.
  void emitEvent(const QString &name, const QJsonValue &data, Scope scope);

  // Called by the page with a BridgeRequest. `page` is the name the
  // document gave itself, which its answer carries back.
  Q_INVOKABLE void send(const QString &page, const QString &message);

Q_SIGNALS:
  // A BridgeResponse for the page named `target`, or a BridgeEvent, with
  // an empty target, for whichever page is there.
  void message(const QString &target, const QString &message);

private:
  struct Method {
    Scope scope;
    Handler handler;
  };

  bool allows(Scope scope) const;
  void answer(const Call &call, const QJsonObject &response);

  Page m_page = Page::Other;
  QHash<QString, Method> m_methods;
};
