using System;
using Contoso.Storage;

namespace Contoso
{
    public class Unrelated
    {
        public void Run(Helper helper)
        {
            // CloudStorageAccount.Parse(...) is only mentioned here
            var parsed = helper.CloudStorageAccount.Parse("x");
            var other = Contoso.Storage.CloudBlobClient.Create();
            Console.WriteLine("new CloudBlobContainer(x)");
        }
    }
}
