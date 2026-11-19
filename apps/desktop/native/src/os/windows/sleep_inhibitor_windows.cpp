#include "os/sleep_inhibitor.h"

#include <windows.h>

// Windows keeps the display on for a thread that says it needs it, until
// the thread says otherwise. The app always asks from its main thread.
struct SleepInhibitor::Platform {};

SleepInhibitor::SleepInhibitor(QWindow *) : m_platform(std::make_unique<Platform>()) {}

SleepInhibitor::~SleepInhibitor() { setActive(false); }

void SleepInhibitor::setActive(bool active) {
  if (active == m_active) return;
  m_active = active;
  SetThreadExecutionState(active ? ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
                                 : ES_CONTINUOUS);
}
