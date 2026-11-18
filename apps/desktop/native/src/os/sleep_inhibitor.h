#pragma once

#include <memory>

class QWindow;

// Keeps the screen on and the machine awake while a video plays.
class SleepInhibitor {
public:
  // `window` is the one the video plays in, which some systems hold the
  // screen for. It has to outlive this.
  explicit SleepInhibitor(QWindow *window);
  ~SleepInhibitor();

  SleepInhibitor(const SleepInhibitor &) = delete;
  SleepInhibitor &operator=(const SleepInhibitor &) = delete;

  void setActive(bool active);

private:
  struct Platform;

  std::unique_ptr<Platform> m_platform;
  bool m_active = false;
};
