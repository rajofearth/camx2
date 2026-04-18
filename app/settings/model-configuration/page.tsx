"use client";

import { EndpointSettings } from "@/components/settings/model-configuration/endpoint-settings";
import { ModelAssignment } from "@/components/settings/model-configuration/model-assignment";
import { ModelConfigFooter } from "@/components/settings/model-configuration/model-config-footer";
import { ModelConfigurationProvider } from "@/components/settings/model-configuration/model-configuration-context";
import { PageHeader } from "@/components/shell";

export default function ModelConfigurationPage() {
  return (
    <ModelConfigurationProvider>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader
          subtitle={
            <span className="uppercase tracking-wider">
              Manage backend VLM and LLM endpoint parameters.
            </span>
          }
          title="Model Configuration"
        />

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 pb-8">
            <EndpointSettings />
            <ModelAssignment />
            <ModelConfigFooter />
          </div>
        </div>
      </div>
    </ModelConfigurationProvider>
  );
}
