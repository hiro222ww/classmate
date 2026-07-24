import { describe, expect, it } from "vitest";
import {
  emailSubjectForEventType,
  isEmailNotificationEventType,
} from "./emailNotificationConstraints";
import { prefsAllowEvent } from "./emailNotificationPrefs";

describe("emailNotificationConstraints", () => {
  it("allows only call/meeting events", () => {
    expect(isEmailNotificationEventType("call_request_created")).toBe(true);
    expect(isEmailNotificationEventType("meeting_plan_created")).toBe(true);
    expect(isEmailNotificationEventType("meeting_plan_updated")).toBe(true);
    expect(isEmailNotificationEventType("class_message_created")).toBe(false);
  });

  it("builds subjects", () => {
    expect(emailSubjectForEventType("call_request_created")).toContain(
      "話せる人"
    );
    expect(emailSubjectForEventType("meeting_plan_updated")).toContain("更新");
  });
});

describe("prefsAllowEvent", () => {
  it("requires master email_enabled", () => {
    expect(
      prefsAllowEvent(
        {
          email_enabled: false,
          email_call_request: true,
          email_meeting_plan: true,
        },
        "call_request_created"
      )
    ).toBe(false);
  });

  it("respects per-type flags", () => {
    expect(
      prefsAllowEvent(
        {
          email_enabled: true,
          email_call_request: false,
          email_meeting_plan: true,
        },
        "call_request_created"
      )
    ).toBe(false);
    expect(
      prefsAllowEvent(
        {
          email_enabled: true,
          email_call_request: false,
          email_meeting_plan: true,
        },
        "meeting_plan_created"
      )
    ).toBe(true);
  });
});
