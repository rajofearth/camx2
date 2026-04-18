import type { ReactNode } from "react";

import { SettingsSidebar } from "@/components/shell";

const settingsGroups = [
  {
    heading: "System Settings",
    items: [
      {
        href: "/settings/deployment-profile",
        label: "Deployment Profile",
        icon: "dns",
      },
      {
        href: "/settings/camera-management",
        label: "Camera Management",
        icon: "videocam",
      },
      {
        href: "/settings/alert-configuration",
        label: "Alert Configuration",
        icon: "warning",
      },
      {
        href: "/settings/threat-log",
        label: "Threat Log",
        icon: "gpp_bad",
      },
      {
        href: "/settings/face-enrollment",
        label: "Face Enrollment",
        icon: "face_retouching_natural",
      },
      {
        href: "/settings/model-configuration",
        label: "Model Configuration",
        icon: "model_training",
      },
      {
        href: "/settings/user-management",
        label: "User Management",
        icon: "group",
      },
    ],
  },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-op-base">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SettingsSidebar groups={settingsGroups} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-op-base">
          {children}
        </main>
      </div>
    </div>
  );
}
