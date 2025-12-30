export type CommitScanJobData = {
  jobId: string;

  org: string;
  year: number;
  from: string; // UTC ISO
  to: string; // UTC ISO

  accessToken: string;
  userLogin: string;
  userId: string;
  authorEmails: string[];
};

export type OrgYearSyncJobData = {
  jobId: string;

  org: string;
  year: number;
  from: string; // UTC ISO
  to: string; // UTC ISO
  timezone: "Asia/Shanghai";

  accessToken: string;
  startedBy: string;
};
