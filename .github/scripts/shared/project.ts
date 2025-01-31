import { GitHub } from '@actions/github/lib/utils';

const MAX_NB_FETCHES = 10; // For protection against infinite loops.

export interface ProjectV2 {
  id: string;
  fields: ProjectV2Field[];
}

interface ProjectV2Field {
  id: string;
  name: string; 
}

export interface ProjectV2Issue {
  id: string;
  itemId: string;
  cutDate: string;
}

interface RawProjectV2Issue {
  id: string;
  content: {
    id: string;
  };
  cutDate: {
    date: string;
  }
}

interface RawProjectV2Issues {
  pageInfo: {
    endCursor: string;
  }
  nodes: RawProjectV2Issue[];
}

// This function retrieves a Github Project
export async function retrieveProjectV2(
  octokit: InstanceType<typeof GitHub>,
  projectNumber: number,
): Promise<ProjectV2> {
  const retrieveProjectQuery = `
      query ($projectNumber: Int!) {
        organization(login: "MetaMask") {
            projectV2(number: $projectNumber) {
                id
                fields(first: 20) {
                    nodes {
                        ... on ProjectV2Field {
                            id
                            name
                        }
                    }
                }
            }
        }
      }
    `;

  const retrieveProjectResult: {
    organization: {
      projectV2: {
        id: string;
        fields: {
          nodes: {
            id: string;
            name: string;
          }[];
        };
      };
    };
  } = await octokit.graphql(retrieveProjectQuery, {
    projectNumber,
  });

  const project: ProjectV2 = {
    id: retrieveProjectResult.organization.projectV2.id,
    fields: retrieveProjectResult.organization.projectV2.fields.nodes,
  }

  return project;
}

// This function retrieves a Github Project's issues
export async function retrieveProjectV2Issues(
  octokit: InstanceType<typeof GitHub>,
  projectId: string,
  cursor: string | undefined,
): Promise<RawProjectV2Issues> {
  const after = cursor ? `after: "${cursor}"`: '';

  const retrieveProjectV2IssuesQuery = `
      query ($projectId: ID!) {
          node(id: $projectId) {
              ... on ProjectV2 {
                  items(
                      first: 100
                      ${after}
                  ) {
                      pageInfo {
                          endCursor
                      }
                      nodes {
                          id
                          content {
                              ... on Issue {
                                  id
                              }
                          }
                          cutDate: fieldValueByName(name: "RC Cut") {
                              ... on ProjectV2ItemFieldDateValue {
                                  date
                              }
                          }
                      }
                  }
              }
          }
      }
    `;

  const retrieveProjectV2IssuesResult: {
    node: {
      items: {
        totalCount: number;
        pageInfo: {
          endCursor: string;
        }
        nodes: {
          id: string;
          content: {
            id: string;
          };
          cutDate: {
            date: string;
          }
        }[];
      };
    };
  } = await octokit.graphql(retrieveProjectV2IssuesQuery, {
    projectId,
  });

  const projectV2Issues: RawProjectV2Issues = retrieveProjectV2IssuesResult.node.items;

  return projectV2Issues;
}

// This function retrieves a Github Project issue with specific ID
export async function retrieveProjectV2IssueRecursively(
  nbFetches: number,
  octokit: InstanceType<typeof GitHub>,
  projectId: string,
  issueId: string,
  cursor: string | undefined
): Promise<ProjectV2Issue | undefined> {
  try {
      if (nbFetches >= MAX_NB_FETCHES) {
        throw new Error(`Forbidden: Trying to do more than ${MAX_NB_FETCHES} fetches (${nbFetches}).`);
      }

      const projectV2IssuesResponse: RawProjectV2Issues = await retrieveProjectV2Issues(octokit, projectId, cursor);

      const projectV2IssueResponseWithSameId: RawProjectV2Issue | undefined = projectV2IssuesResponse.nodes.find(issue => issue.content.id === issueId);

      if (projectV2IssueResponseWithSameId) {
        const projectV2Issue: ProjectV2Issue = {
          id: projectV2IssueResponseWithSameId.content.id,
          itemId: projectV2IssueResponseWithSameId.id,
          cutDate: projectV2IssueResponseWithSameId.cutDate.date
        }
        return projectV2Issue;
      }
      
      const newCursor = projectV2IssuesResponse.pageInfo.endCursor;
      if(newCursor) {
          return (await retrieveProjectV2IssueRecursively(nbFetches + 1, octokit, projectId, issueId, newCursor));
      } else {
        return undefined;
      }

  } catch (error) {
      console.error("Failed to fetch project issue on GitHub:", error);
      throw error; // Rethrow the error to handle it further up the call stack if necessary
  }
}

// This function adds an issue to a Github Project
export async function addIssueToGithubProject(
  octokit: InstanceType<typeof GitHub>,
  projectNumber: number,
  issueId: string
): Promise<void> {
  // Retrieve project, in order to obtain its ID
  const project: ProjectV2 = await retrieveProjectV2(octokit, projectNumber);

  if (!project) {
    throw new Error(`Project with number ${projectNumber} was not found.`);
  }

  if (!project.id) {
    throw new Error(`Project with number ${projectNumber} was found, but it has no 'id' property.`);
  }

  const addProjectV2ItemByIdMutation = `
      mutation ($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
          clientMutationId
        }
      }
    `;

  await octokit.graphql(addProjectV2ItemByIdMutation, {
    projectId: project.id,
    contentId: issueId,
  });
}

// This function updates an issue's date property on a Github Project
export async function updateGithubProjectDateProperty(
  octokit: InstanceType<typeof GitHub>,
  projectNumber: number,
  issueId: string,
  newDatePropertyValue: string,
): Promise<void> {
  const projectFieldName: string = "RC Cut";

  if (!isValidDateFormat(newDatePropertyValue)) {
    throw new Error(`Invalid input: date ${newDatePropertyValue} doesn't match "YYYY-MM-DD" format.`);
  }

  // Retrieve project, in order to obtain its ID
  const project: ProjectV2 = await retrieveProjectV2(octokit, projectNumber);

  if (!project) {
    throw new Error(`Project with number ${projectNumber} was not found.`);
  }

  if (!project.id) {
    throw new Error(`Project with number ${projectNumber} was found, but it has no 'id' property.`);
  }

  if (!project.fields) {
    throw new Error(`Project with number ${projectNumber} was found, but it has no 'fields' property.`);
  }

  const projectField: ProjectV2Field | undefined = project.fields.find(field => field.name === projectFieldName);

  if (!projectField) {
    throw new Error(`Project field with name ${projectFieldName} was not found on Github Project with ID ${project.id}.`);
  }

  if (!projectField.id) {
    throw new Error(`Project field with name ${projectFieldName} was found on Github Project with ID ${project.id}, but it has no 'id' property.`);
  }

  const issue: ProjectV2Issue | undefined = await retrieveProjectV2IssueRecursively(0, octokit, project.id, issueId, undefined);

  if (!issue) {
    throw new Error(`Issue with ID ${issueId} was not found on Github Project with ID ${project.id}.`);
  }

  const updateProjectV2ItemFieldValueMutation = `
      mutation ($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: String!) {
        updateProjectV2ItemFieldValue(
            input: {
                projectId: $projectId
                itemId: $itemId
                fieldId: $fieldId
                value: { date: $date }
            }
        ) {
            projectV2Item {
                id
            }
        }
      }
    `;

  await octokit.graphql(updateProjectV2ItemFieldValueMutation, {
    projectId: project.id,
    itemId: issue.itemId,
    fieldId: projectField.id,
    date: newDatePropertyValue
  });
}

// This function checks if a string has the date format "YYYY-MM-DD".
function isValidDateFormat(dateString: string): boolean {
  // Regular expression to match the date format "YYYY-MM-DD"
  const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;

  // Check if the dateString matches the regex
  if (!dateFormatRegex.test(dateString)) {
    return false;
  }

  // Parse the date components
  const [year, month, day] = dateString.split('-').map(Number);

  // Check if the date components form a valid date
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}