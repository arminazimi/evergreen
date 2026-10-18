using System;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;
using Az = Microsoft.WindowsAzure.Storage.Queue;

// CloudStorageAccount.Parse("commented out");
namespace App
{
    public static class Program
    {
        public static void Main()
        {
            var account = CloudStorageAccount.Parse("UseDevelopmentStorage=true");
            CloudBlobClient blobs = account.CreateCloudBlobClient();
            var container = new CloudBlobContainer(new Uri("https://x"));
            var queues = new Az.CloudQueueClient(new Uri("https://x"), null);
            var tables = new Microsoft.WindowsAzure.Storage.Table.CloudTableClient(new Uri("https://x"), null);
            Console.WriteLine("CloudStorageAccount.Parse(not code)");
            using (var stream = new System.IO.MemoryStream()) { }
        }
    }
}
