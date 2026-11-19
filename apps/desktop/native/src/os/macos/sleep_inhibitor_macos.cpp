#include "os/sleep_inhibitor.h"

#include <IOKit/pwr_mgt/IOPMLib.h>

// A power assertion: while it's held, the display doesn't sleep.
struct SleepInhibitor::Platform {
  IOPMAssertionID assertion = kIOPMNullAssertionID;
};

// The assertion is the whole system's, so the window doesn't come into it.
SleepInhibitor::SleepInhibitor(QWindow *) : m_platform(std::make_unique<Platform>()) {}

SleepInhibitor::~SleepInhibitor() { setActive(false); }

void SleepInhibitor::setActive(bool active) {
  if (active == m_active) return;
  m_active = active;
  if (!active) {
    if (m_platform->assertion != kIOPMNullAssertionID) {
      IOPMAssertionRelease(m_platform->assertion);
      m_platform->assertion = kIOPMNullAssertionID;
    }
    return;
  }
  if (IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleDisplaySleep,
                                  kIOPMAssertionLevelOn, CFSTR("Playing video"),
                                  &m_platform->assertion) != kIOReturnSuccess) {
    m_platform->assertion = kIOPMNullAssertionID;
  }
}
