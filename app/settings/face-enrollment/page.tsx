"use client";

import * as React from "react";

import { exportEnrollmentSubjectsCsv } from "@/components/settings/face-enrollment/csv-export";
import { EnrollPlaceholderCard } from "@/components/settings/face-enrollment/enroll-placeholder-card";
import { EnrollSubjectDialog } from "@/components/settings/face-enrollment/enroll-subject-dialog";
import {
  MOCK_ENROLLMENT_SUBJECTS,
  MOCK_SUBJECT_COUNT,
  TOTAL_REGISTRY_ENTRIES,
} from "@/components/settings/face-enrollment/mock-subjects";
import { RegistryStatusFooter } from "@/components/settings/face-enrollment/registry-status-footer";
import { RegistryToolbar } from "@/components/settings/face-enrollment/registry-toolbar";
import { SelectionDetailBar } from "@/components/settings/face-enrollment/selection-detail-bar";
import { SubjectCard } from "@/components/settings/face-enrollment/subject-card";
import { SubjectDetailDialog } from "@/components/settings/face-enrollment/subject-detail-dialog";

export default function FaceEnrollmentPage() {
  const [subjects, setSubjects] = React.useState(MOCK_ENROLLMENT_SUBJECTS);
  const [selectedId, setSelectedId] = React.useState(
    MOCK_ENROLLMENT_SUBJECTS[0]?.id ?? "",
  );
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [enrollOpen, setEnrollOpen] = React.useState(false);

  const selected = subjects.find((s) => s.id === selectedId) ?? null;

  const totalRegistryCount =
    TOTAL_REGISTRY_ENTRIES - MOCK_SUBJECT_COUNT + subjects.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-op-base">
      <RegistryToolbar
        onEnroll={() => setEnrollOpen(true)}
        onExportCsv={() => exportEnrollmentSubjectsCsv(subjects)}
        totalEntries={totalRegistryCount}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              onOpen={() => {
                setSelectedId(subject.id);
                setDetailOpen(true);
              }}
              selected={subject.id === selectedId}
              subject={subject}
            />
          ))}
          <EnrollPlaceholderCard onOpenEnroll={() => setEnrollOpen(true)} />
        </div>
      </div>
      <SelectionDetailBar
        onViewDossier={() => {
          if (selected) {
            setDetailOpen(true);
          }
        }}
        subject={selected}
      />
      <RegistryStatusFooter />

      {selected ? (
        <SubjectDetailDialog
          onOpenChange={setDetailOpen}
          open={detailOpen}
          subject={selected}
        />
      ) : null}

      <EnrollSubjectDialog
        onEnrolled={(s) => {
          setSubjects((prev) => [...prev, s]);
          setSelectedId(s.id);
        }}
        onOpenChange={setEnrollOpen}
        open={enrollOpen}
      />
    </div>
  );
}
