import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';

import { retrieveIssue } from './shared/issue';
import {
  Labelable,
  LabelableType,
  findLabel,
  addLabelToLabelable,
  removeLabelFromLabelable,
  removeLabelFromLabelableIfPresent,
} from './shared/labelable';
import {
  Label,
  externalContributorLabel,
  flakyTestsLabel,
  invalidIssueTemplateLabel,
  invalidPullRequestTemplateLabel,
} from './shared/label';
import { TemplateType, templates } from './shared/template';
import { retrievePullRequest } from './shared/pullRequest';

main().catch((error: Error): void => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  // "GITHUB_TOKEN" is an automatically generated, repository-specific access token provided by GitHub Actions.
  // We can't use "GITHUB_TOKEN" here, as its permissions don't allow neither to create new labels
  // nor to retrieve the content of organisations Github Projects.
  // In our case, we may want to create "regression-RC-x.y.z" label when it doesn't already exist.
  // We may also want to retrieve the content of organisation's Github Projects.
  // As a consequence, we need to create our own "BUG_REPORT_TOKEN" with "repo" and "read:org" permissions.
  // Such a token allows both to create new labels and fetch the content of organisation's Github Projects.
  const personalAccessToken = process.env.BUG_REPORT_TOKEN;
  if (!personalAccessToken) {
    core.setFailed('BUG_REPORT_TOKEN not found');
    process.exit(1);
  }

  const releasesGithubProjectBoardNumber = process.env.RELEASES_GITHUB_PROJECT_BOARD_NUMBER;
  if (!releasesGithubProjectBoardNumber) {
    core.setFailed('RELEASES_GITHUB_PROJECT_BOARD_NUMBER not found');
    process.exit(1);
  }

  const releaseVersion = process.env.RELEASE_VERSION;
  if (!releaseVersion) {
    core.setFailed('RELEASE_VERSION not found');
    process.exit(1);
  }

  // Initialise octokit, required to call Github GraphQL API
  const octokit: InstanceType<typeof GitHub> = getOctokit(personalAccessToken, {
    previews: ['bane'], // The "bane" preview is required for adding, updating, creating and deleting labels.
  });



}