export interface IAuthWorkspace {
  id: string;
  name: string;
}

export interface IAuthResponse {
  workspaces: IAuthWorkspace[];
}
