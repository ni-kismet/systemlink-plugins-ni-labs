/** A dashboard entry returned by DashboardHost search API. */
export interface IDashboardSearchItem {
  uid: string;
  title: string;
  folderUid: string;
  folderTitle: string;
}

/** A dashboard folder entry returned by DashboardHost search API when type=dash-folder. */
export interface IDashboardFolderSearchItem {
  uid: string;
  title: string;
}
